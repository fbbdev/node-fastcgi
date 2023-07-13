/**
 * Copyright (c) 2023 Fabio Massaioli, Robert Groh and other contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the 'Software'), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';
/*global describe, it, before, after */
/*jshint node: true */
/*jshint expr: true*/

const fcgiHandler = require('fcgi-handler'),
      http = require('http'),
      expect = require('chai').expect;

let fetch;
fetch = async (...args) => {
    fetch = (await import('node-fetch')).default;
    return fetch(...args);
};

const fcgi = require('../../../index.js');

describe('multiwrite server', function setup() {
    let httpURL;

    before(function startFcgiServer(done) {
        function sendError(res, err) {
            res.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': err.stack.length + 1
            });
            res.end(err.stack + '\n');
        }

        const fcgiServer = fcgi.createServer(function multiwrite(req, res) {
            req.resume();
            req.on('end', () => {
                try {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Length': 3
                    });

                    res.write("a");
                    res.write("b");
                    res.end("c");
                } catch (err) {
                    sendError(res, err);
                }
            });

            req.on('error', sendError.bind(null, res));
        })

        fcgiServer.listen(0, '127.0.0.1', function startHttpServer(err) {
            if (err) {
                done(err);
                return;
            }

            const fcgiAddr = fcgiServer.address();
            console.log(`fcgi server listening at ${fcgiAddr.address}:${fcgiAddr.port}`);

            const httpServer = http.createServer((req, res) => {
                fcgiHandler.connect(fcgiAddr, (err, fcgiProcess) => {
                    if (err)
                        sendError(res, err);
                    else
                        fcgiProcess.handle(req, res, {});
                });
            });

            httpServer.listen(0, '127.0.0.1', (err) => {
                if (err) {
                    done(err);
                    return;
                }

                const httpAddr = httpServer.address();
                console.log(`http server listening at ${httpAddr.address}:${httpAddr.port}`);

                httpURL = new URL(`http://${httpAddr.address}:${httpAddr.port}`);

                done();
            });
        });
    });

    it('should answer with the expected body', async () => {
        const res = await fetch(httpURL);
        expect(res.status).to.be.equal(200);

        const body = await res.text();
        expect(body).to.be.equal("abc");
    });
});
