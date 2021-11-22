'use strict';

const util = require('util');
const {StorageAdapter, StorageItem} = require('storj-lib');
const {Readable} = require('stream');
const mkdirp = require('mkdirp');
const assert = require('assert');
const fs = require('fs');
const utils = require('../utils');

function LocalFilesystemAdapter(storagePath) {
    if (!(this instanceof LocalFilesystemAdapter)) {
        return new LocalFilesystemAdapter(storagePath);
    }

    this._validatePath(storagePath);

    this._path = storagePath;
    this._fs = fs;

}

LocalFilesystemAdapter.FILE_ENCODING = 'utf8';

util.inherits(LocalFilesystemAdapter, StorageAdapter);


/**
 * Validates the storage path supplied
 * @private
 */
LocalFilesystemAdapter.prototype._validatePath = function (storageDirPath) {
    if (!utils.existsSync(storageDirPath)) {
        mkdirp.sync(storageDirPath);
    }

    assert(
        utils.isDirectory(storageDirPath),
        'Invalid directory path supplied'
    );
};

/**
 * Builds the path where the item is located
 * @param key
 * @returns {string}
 * @private
 */
LocalFilesystemAdapter.prototype._getItemPath = function (key) {
    return `${this._path}/${key}`;
};

/**
 * Validates the storage path supplied
 * @private
 */
LocalFilesystemAdapter.prototype._existsItem = function (key) {
    const itemPath = this._getItemPath(key);
    return fs.existsSync(itemPath);
};

/**
 * Implements the abstract {@link StorageAdapter#_get}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._get = function (key, callback) {
    const itemPath = this._getItemPath(key);
    if (!this._existsItem(key)) {
        return callback(new Error('Item not found'));
    }
    this._fs.readFile(
        itemPath,
        LocalFilesystemAdapter.FILE_ENCODING,
        (err, data) => {
            if (err) {
                return callback(err);
            }
            callback(null, StorageItem({
                hash: key,
                shard: data
            }));
        }
    );
};

/**
 * Implements the abstract {@link StorageAdapter#_peek}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._peek = function (key, callback) {
    const itemPath = this._getItemPath(key);
    if (!this._existsItem(key)) {
        return callback(new Error('Item not found'));
    }
    this._fs.readFile(
        itemPath,
        LocalFilesystemAdapter.FILE_ENCODING,
        (err, data) => {
            if (err) {
                return callback(err);
            }
            callback(null, data);
        }
    );
};

/**
 * Implements the abstract {@link StorageAdapter#_put}
 * @private
 * @param {String} key
 * @param {Object} item
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._put = function (key, item, callback) {
    const itemPath = this._getItemPath(key);
    this._fs.writeFile(
        itemPath,
        item.shard,
        {
            encoding: LocalFilesystemAdapter.FILE_ENCODING
        },
        (err) => {
            if (err) {
                return callback(err);
            }
            callback(null);
        }
    );
};

/**
 * Implements the abstract {@link StorageAdapter#_del}
 * @private
 * @param {String} key
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._del = function (key, callback) {
    const itemPath = this._getItemPath(key);

    this._fs.unlink(itemPath, (err) => {
        if (err) {
            return callback(err);
        }
        callback(null);
    });
};

/**
 * Implements the abstract {@link StorageAdapter#_flush}
 * @private
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._flush = function (callback) {
    callback();
};

/**
 * Implements the abstract {@link StorageAdapter#_size}
 * @private
 * @param {String} [key]
 * @param {Function} callback
 */
LocalFilesystemAdapter.prototype._size = function (key, callback) {
    if (typeof key === 'function') {
        callback = key;
        // Size all items
        this._fs.readdir(this._path, (err, files) => {
            if (err) {
                return callback(err);
            }
            let totalSize = 0;
            files.forEach(file => {
                this._size(file, function (err, size) {
                    totalSize += size;
                });
            });
            callback(null, totalSize);
        });
    } else {
        // Size specific item
        const itemPath = this._getItemPath(key);
        const stats = this._fs.statSync(itemPath);
        callback(null, stats.size);
    }
};

/**
 * Implements the abstract {@link StorageAdapter#_keys}
 * @private
 * @returns {ReadableStream}
 */
LocalFilesystemAdapter.prototype._keys = function () {
    const files = fs.readdirSync(this._path);

    return Readable({
        read: function () {
            this.push(files.length ? files.shift() : null);
        }
    });
};

module.exports = LocalFilesystemAdapter;
