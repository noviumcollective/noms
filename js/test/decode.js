'use strict';

const {assert} = require('chai');
const {readValue, Ref} = require('../src/decode.js');
const Immutable = require('immutable');

function stringToArrayBufferPromise(string) {
  return new Promise((resolve, reject) => {
    var reader = new FileReader();
    reader.addEventListener('loadend', () => {
      resolve(reader.result);
    });
    reader.readAsArrayBuffer(new Blob([string]));
  });
}

suite('decode.js', function() {

  function testPrimitive(name, expected, data) {
    test(name, done => {
      let ref = 'sha1-c0ffee';
      readValue(ref, (r) => {
        assert.equal(ref, r);
        return stringToArrayBufferPromise(data);
      }).then(value => {
        assert.equal(expected, value);
      }).then(done, done);
    });
  }

  testPrimitive('int8', 1, 'j {"int8":1}')
  testPrimitive('int16', 2, 'j {"int16":2}')
  testPrimitive('int32', 3, 'j {"int32":3}')
  testPrimitive('int64', 4, 'j {"int64":4}')
  testPrimitive('uint8', 5, 'j {"uint8":5}')
  testPrimitive('uint16', 6, 'j {"uint16":6}')
  testPrimitive('uint32', 7, 'j {"uint32":7}')
  testPrimitive('uint64', 8, 'j {"uint64":8}')
  testPrimitive('float32', 9, 'j {"float32":9}')
  testPrimitive('float64', 10, 'j {"float64":10}')

  testPrimitive('boolean true', true, 'j true');
  testPrimitive('boolean false', false, 'j false');
  testPrimitive('string', 'hello', 'j "hello"');

  let chunks = {
    'sha1-list': 'j {"list":[true,false]}',
    'sha1-set': 'j {"set":[true,false]}',
    'sha1-map': 'j {"map":[true,false,"hi",{"int8":42}]}',
    'sha1-blob': 'b abc',
  };

  function testCompound(name, data, func) {
    test(name, done => {
      let ref = 'sha1-c0ffee';
      chunks[ref] = data;
      readValue(ref, (r) => {
        return stringToArrayBufferPromise(chunks[r]);
      }).then(ref => {
        assert.instanceOf(ref, Ref);
        return ref.deref();
      }).then(func)
      .then(done, done);
    });
  }

  testCompound('list', 'j {"list":[true,false]}', value => {
    assert.isTrue(Immutable.List.isList(value));
    assert.isTrue(Immutable.List.of(true, false).equals(value));
  });

  testCompound('set', 'j {"set":[true,false]}', value => {
    assert.isTrue(Immutable.Set.isSet(value));
    assert.isTrue(Immutable.Set.of(true, false).equals(value));
  });

  testCompound('map', 'j {"map":[true,false,"hi",{"int8":42}]}', value => {
    assert.isTrue(Immutable.Map.isMap(value));
    assert.isTrue(Immutable.Map([[true, false], ['hi', 42]]).equals(value));
  });

  testCompound('ref', 'j {"ref":"sha1-list"}', value => {
    assert.isTrue(Immutable.List.isList(value));
    assert.isTrue(Immutable.List.of(true, false).equals(value));
  });

  testCompound('type', 'j {"type":{"kind":{"uint8":0},"name":""}}', value => {
    assert.isTrue(Immutable.Map.isMap(value));
    assert.equal(value.get('kind'), 0);
    assert.equal(value.get('name'), '');
  });

  testCompound('type with desc', 'j {"type":{"kind":{"uint8":14},"name":"T","desc":{"list":[{"ref":"sha1-list"},{"ref":"sha1-map"}]}}}', value => {
    assert.isTrue(Immutable.Map.isMap(value));
    assert.equal(value.get('kind'), 14);
    assert.equal(value.get('name'), 'T');
    assert.isTrue(Ref.isRef(value.get('desc')));
    return value.get('desc').deref().then(list => {
      assert.isTrue(Immutable.List.isList(list));
      assert.equal(2, list.size);
      assert.isTrue(Ref.isRef(list.get(0)));
      assert.isTrue(Ref.isRef(list.get(1)));
    });
  });

  testCompound('type enum', 'j {"type":{"desc":{"list":["f","g"]},"kind":{"uint8":18},"name":"enum"}}', value => {
    assert.isTrue(Immutable.Map.isMap(value));
    assert.equal(value.get('kind'), 18);
    assert.equal(value.get('name'), 'enum');
    assert.isTrue(Ref.isRef(value.get('desc')));
    return value.get('desc').deref().then(list => {
      assert.isTrue(Immutable.List.isList(list));
      assert.equal(2, list.size);
      assert.equal('f', list.get(0));
      assert.equal('g', list.get(1));
    })
  });

  testCompound('type with pkg', 'j {"type":{"kind":{"uint8":13},"name":"Commit","pkgRef":{"ref":"sha1-map"}}}', value => {
    assert.isTrue(Immutable.Map.isMap(value));
    assert.equal(value.get('kind'), 13);
    assert.equal(value.get('name'), 'Commit');
    assert.isTrue(Ref.isRef(value.get('pkgRef')));
    return value.get('pkgRef').deref().then(map => {
      assert.isTrue(Immutable.Map.isMap(map));
    })
  });

  test('blob', done => {
    let data = 'b abc';
    let ref = 'sha1-c0ffee';
    readValue(ref, (r) => {
      assert.equal(ref, r);
      return stringToArrayBufferPromise(data);
    }).then(chunk => {
      assert.instanceOf(chunk, ArrayBuffer);
      assert.equal(3, chunk.byteLength);
    }).then(done, done);
  });

  testCompound('list with ref', 'j {"list":[{"ref":"sha1-list"}]}', value => {
    assert.isTrue(Immutable.List.isList(value));
    assert.equal(1, value.size);
    assert.instanceOf(value.get(0), Ref);
    return value.get(0).deref().then(value => {
      assert.isTrue(Immutable.List.isList(value));
      assert.equal(2, value.size);
      assert.isTrue(Immutable.List.of(true, false).equals(value));
    });
  });

  testCompound('compound list', 'j {"cl":["sha1-list",2,"sha1-list",2]}', value => {
    assert.isTrue(Immutable.List.isList(value));
    assert.isTrue(Immutable.List.of(true, false, true, false).equals(value));
  });

  testCompound('compound blob', 'j {"cb":["sha1-blob",3,"sha1-blob",3]}', value => {
    assert.instanceOf(value, Blob);
    assert.equal(6, value.size);
  });

});