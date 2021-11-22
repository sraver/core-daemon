'use strict';

const {expect} = require('chai');
const sinon = require('sinon');
const os = require('os');
const path = require('path');
const TMP_DIR = path.join(os.tmpdir(), 'LOCAL_STORAGE');
const {StorageItem} = require('storj-lib');
const LocalFilesystemAdapter = require('../../lib/storage/local');

function tmpdir() {
    return path.join(TMP_DIR, 'test-' + Date.now());
}

let store = null;
const item = StorageItem({
    hash: 'my_key',
    shard: 'my_data'
});

describe('LocalFilesystemAdapter', function () {

    before(function () {
        store = LocalFilesystemAdapter(tmpdir());
    });

    describe('#construct', function () {

        it('should create instance without the new keyword', () => {
            expect(
                LocalFilesystemAdapter(tmpdir())
            ).to.be.instanceOf(LocalFilesystemAdapter);
        });

        it('should create the storage path if it does not exist', () => {
            const storagePath = tmpdir() + '/non-existent';
            expect(store._fs.existsSync(storagePath)).be.false;
            LocalFilesystemAdapter(storagePath);
            expect(store._fs.existsSync(storagePath)).be.true;
        });

    });

    describe('#_put', function () {

        it('should not return error on store', (done) => {
            store._put(item.hash, item, function (err) {
                expect(err).equal(null);
                done();
            });
        });

        it('should return error on FS failure', (done) => {
            const fsWriteFile = sinon
                .stub(store._fs, 'writeFile')
                .callsArgWith(3, new Error('persistence error'));

            store._put(item.hash, item, function (err) {
                expect(err.message).equal('persistence error');
                done();
            });

            fsWriteFile.restore();
        });

    });

    describe('#_get', function () {

        it('should retrieve item data', (done) => {
            store._get(item.hash, (err, retrieved_item) => {
                expect(err).equal(null);
                expect(retrieved_item.shard).equal(item.shard);
                done();
            });
        });

        it('should return error when item does not exist', (done) => {
            const fsExistsSync = sinon
                .stub(store._fs, 'existsSync')
                .returns(false);

            store._get('random_key', function (err) {
                expect(err.message).to.equal('Item not found');
                done();
            });

            fsExistsSync.restore();
        });

        it('should return error on retrieval failure', (done) => {
            const fsExistsSync = sinon
                .stub(store._fs, 'existsSync')
                .returns(true);

            const fsReadFile = sinon
                .stub(store._fs, 'readFile')
                .callsArgWith(2, new Error('writing error'));

            store._get('random_key', function (err) {
                expect(err.message).to.equal('writing error');
                done();
            });

            fsExistsSync.restore();
            fsReadFile.restore();
        });

    });

    describe('#_keys', function () {

        it('should list all keys on the store', (done) => {
            const keysStream = store._keys();
            keysStream
                .on('data', function (key) {
                    expect(key.toString()).to.equal(item.hash);
                })
                .on('end', done);
        });

        it('should return as many keys as files on the filesystem', (done) => {
            const fsReaddirSync = sinon
                .stub(store._fs, 'readdirSync')
                .returns([
                    'key1',
                    'key2',
                    'key3'
                ]);

            let finalKeys = [];

            store._keys()
                .on('data', function (key) {
                    finalKeys.push(key.toString());
                })
                .on('end', function () {
                    expect(finalKeys).to.have.members([
                        'key1',
                        'key2',
                        'key3'
                    ]);
                    done();
                });

            fsReaddirSync.restore();
        });

    });

    describe('#_del', function () {

        it('should call unlink without errors', (done) => {
            const fsUnlink = sinon
                .stub(store._fs, 'unlink')
                .callsArgWith(1, null);

            store._del('any_key', (err) => {
                sinon.assert.calledOnce(fsUnlink);
                expect(err).to.equal(null);
                done();
            });

            fsUnlink.restore();
        });

        it('should return error if unlink fails', (done) => {
            const fsUnlink = sinon
                .stub(store._fs, 'unlink')
                .callsArgWith(1, new Error('No permissions'));

            store._del('any_key', (err) => {
                sinon.assert.calledOnce(fsUnlink);
                expect(err.message).to.equal('No permissions');
                done();
            });

            fsUnlink.restore();
        });

    });

    describe('#_size', function () {

        it('should match the size of the specific stored item', (done) => {
            store._size(item.hash, (err, size) => {
                expect(size).to.equal(item.shard.length);
                done();
            });
        });

        it('should match the size of all stored items', (done) => {
            store._size((err, size) => {
                expect(size).to.equal(item.shard.length);
                done();
            });
        });

    });

    describe('#_peek', function () {

        it('should return error when item does not exist', (done) => {
            const fsExistsSync = sinon
                .stub(store._fs, 'existsSync')
                .returns(false);

            store._peek(item.hash, function (err) {
                expect(err.message).to.equal('Item not found');
                done();
            });

            fsExistsSync.restore();
        });

        it('should return error when retrieval fails', (done) => {
            const fsReadFile = sinon
                .stub(store._fs, 'readFile')
                .callsArgWith(2, new Error('fail'));

            store._peek(item.hash, (err) => {
                expect(err.message).to.equal('fail');
                done();
            });

            fsReadFile.restore();
        });

        it('should return raw content of item', (done) => {
            store._peek(item.hash, (err, data) => {
                expect(data).to.equal(item.shard);
                done();
            });
        });

    });

});
