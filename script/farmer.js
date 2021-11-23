#!/usr/bin/env node

'use strict';

const utils = require('../lib/utils');
const storj = require('storj-lib');
const Logger = require('kad-logger-json');
const config = JSON.parse(JSON.stringify(require('../lib/config/farmer')));
const bytes = require('bytes');
const processIsManaged = typeof process.send === 'function';
const LocalFilesystemAdapter = require('../lib/storage/local');

let spaceAllocation = bytes.parse(config.storageAllocation);
let farmerState = {
  bridges: {},
  bridgesConnectionStatus: 0,
  percentUsed: '...',
  spaceUsed: '...',
  totalPeers: 0,
  lastActivity: Date.now(),
  contractCount: 0,
  dataReceivedCount: 0,
  portStatus: {
    listenPort: '...',
    connectionStatus: -1,
    connectionType: ''
  },
  ntpStatus: {
    delta: '...',
    status: -1
  }
};

config.keyPair = new storj.KeyPair(config.networkPrivateKey);
config.logger = new Logger(config.loggerVerbosity);
config.maxShardSize = config.maxShardSize ? bytes.parse(config.maxShardSize) : null;

if (config.S3 && config.S3.enabled) {
  config.storageManager = new storj.StorageManager(
    new storj.BucketStorageAdapter(config.storagePath, { ...config.S3, nodeID: config.keyPair.getNodeID() }),
    {
      maxCapacity: spaceAllocation,
      logger: config.logger
    }
  );
} else if(config.localStorage) {
  config.storageManager = new storj.StorageManager(
    new LocalFilesystemAdapter(config.storagePath),
    {
      maxCapacity: spaceAllocation,
      logger: config.logger
    }
  );
} else {
  config.storageManager = new storj.StorageManager(
    new storj.EmbeddedStorageAdapter(config.storagePath),
    {
      maxCapacity: spaceAllocation,
      logger: config.logger
    }
  );
}


const farmer = storj.Farmer(config);

config.logger.on('log', () => farmerState.lastActivity = Date.now());
config.logger.pipe(process.stdout);

farmer.join((err) => {
  if (err) {
    config.logger.error(err.message);
    process.exit(1);
  }
})
farmer.on('bridgeConnected', (bridge) => {
  farmerState.bridges[bridge.extendedKey] = bridge;
  config.logger.info('Connected to bridge: %s', bridge.url);
});
farmer.connectBridges();
farmer.on('bridgesConnecting', function () {
  farmerState.bridgesConnectionStatus = 1;
});
farmer.on('bridgeChallenge', (bridge) => {
  farmerState.bridgesConnectionStatus = 2;
});
farmer.on('bridgesConnected', function () {
  farmerState.bridgesConnectionStatus = 3;
});

process.on('message', function (msg) {
  if (msg === 'clean') {
    cleanNode();
  }
});

function transportInitialized() {
  return farmer.transport._requiresTraversal !== undefined
    && farmer.transport._portOpen !== undefined;
}

function getPort() {
  if (transportInitialized()) {
    return farmer.transport._contact.port;
  }
  return '...';
}

function getConnectionType() {
  if (!transportInitialized()) {
    return '';
  }
  if (farmer._tunneled) {
    return '(Tunnel)';
  }
  if (!farmer.transport._requiresTraversal
    && !farmer.transport._publicIp) {
    return '(Private)';
  }
  return farmer.transport._requiresTraversal ? '(uPnP)' : '(TCP)';
}

function getConnectionStatus() {
  if (!transportInitialized()) {
    return -1;
  }
  if (farmer.transport._portOpen) {
    return 0;
  }
  if (farmer._tunneled) {
    return 1;
  }
  if (!farmer.transport._requiresTraversal
    && !farmer.transport._publicIp) {
    return 2;
  }
  return -1;
}

function sendFarmerState() {
  farmerState.portStatus.listenPort = getPort();
  farmerState.portStatus.connectionType = getConnectionType();
  farmerState.portStatus.connectionStatus = getConnectionStatus();
  farmerState.totalPeers = farmer.router.length;
  farmerState.contractCount = farmer._contractCount || 0;
  farmerState.dataReceivedCount = farmer._dataReceivedCount || 0;
  process.send(farmerState);
}

function updatePercentUsed() {
  config.storageManager._storage.size((err, result) => {
    if (result) {
      farmerState.spaceUsed = bytes(result);
      farmerState.spaceUsedBytes = result;
      farmerState.percentUsed = ((result / spaceAllocation) * 100).toFixed();
    }
  });
}

function updateNtpDelta() {
  storj.utils.getNtpTimeDelta(function (err, delta) {
    if (err) {
      farmerState.ntpStatus.delta = '...';
      farmerState.ntpStatus.status = -1;
    }
    else {
      farmerState.ntpStatus.delta = delta + 'ms';
      if (delta > 9999 || delta < -9999) {
        farmerState.ntpStatus.delta = '>9999ms';
      }
      if (delta <= 500 && delta >= -500) {
        farmerState.ntpStatus.status = 0;
      }
      else {
        farmerState.ntpStatus.status = 2;
      }
    }
  });
}

function cleanNode() {
  farmer.initCleaner((err) => {
    if (err) {
      config.logger.error('Error cleaning farmer. Reason: ', err.message)
    } else {
      config.logger.info('Cleaning finished')
    }
    updatePercentUsed();
  })
}

updatePercentUsed();
setInterval(updatePercentUsed, 10 * 60 * 1000); // Update space every 10 mins

setInterval(cleanNode, 24 * 60 * 60 * 1000); // Update space every day

if (processIsManaged) {
  updateNtpDelta();
  setInterval(updateNtpDelta, 10 * 60 * 1000); // Update ntp delta every 10 mins

  sendFarmerState();
  setInterval(sendFarmerState, 10 * 1000); // Update state every 10 secs
}
