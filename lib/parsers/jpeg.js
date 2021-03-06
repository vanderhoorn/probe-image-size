'use strict';


var ParserStream = require('../common').ParserStream;
var once         = require('../common').once;


function parseJpegMarker(parser, callback) {
  parser._bytes(2, function (data) {
    if (data[0] !== 0xFF) {
      // not a JPEG marker
      callback();
      return;
    }

    var code = data[1];

    // standalone markers, according to JPEG 1992,
    // http://www.w3.org/Graphics/JPEG/itu-t81.pdf, see Table B.1
    if ((0xD0 <= code && code <= 0xD9) || code === 0x01) {
      callback(code, 0);
      return;
    }

    // the rest of the unreserved markers
    if (0xC0 <= code && code <= 0xFE) {
      parser._bytes(2, function (length) {
        callback(code, length.readUInt16BE(0) - 2);
      });
      return;
    }

    // unknown markers
    callback();
  });
}


function getJpegSize(parser, callback) {
  parseJpegMarker(parser, function (code, length) {
    if (!code || length < 0) {
      // invalid jpeg
      parser._skipBytes(Infinity);
      callback();
      return;
    }

    if (code === 0xD9 /* EOI */ || code === 0xDA /* SOS */) {
      // end of the datastream
      parser._skipBytes(Infinity);
      callback();
      return;
    }

    if ((0xC0 <= code && code <= 0xCF) &&
        code !== 0xC4 && code !== 0xC8 && code !== 0xCC) {

      parser._bytes(length, function (data) {
        parser._skipBytes(Infinity);
        callback(null, {
          width:  data.readUInt16BE(3),
          height: data.readUInt16BE(1),
          type: 'jpg',
          mime: 'image/jpeg'
        });
      });
      return;
    }

    if (length <= 0) {
      // e.g. empty comment
      getJpegSize(parser, callback);
      return;
    }

    parser._skipBytes(length, function () {
      getJpegSize(parser, callback);
    });
  });
}


module.exports = function (input, _callback) {
  var callback = once(_callback);
  var parser   = new ParserStream();

  parser.on('unpipe', function () {
    callback();
    return;
  });

  parser._bytes(2, function (data) {
    if (data[0] !== 0xFF || data[1] !== 0xD8) {
      // first marker of the file MUST be 0xFFD8
      parser._skipBytes(Infinity);
      callback();
      return;
    }

    getJpegSize(parser, callback);
  });

  input.pipe(parser);
};
