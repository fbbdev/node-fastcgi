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
      stream = require('stream'),
      expect = require('chai').expect;

const fcgi = require('../../../index.js');

function timeoutSignal(ms) {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
}

describe('stdin backpressuring server', function setup() {
    let httpURL;

    stream.setDefaultHighWaterMark(false, 3);

    before(function startFcgiServer(done) {
        function sendError(res, err) {
            res.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Length': err.stack.length + 1
            });
            res.end(err.stack + '\n');
        }

        const fcgiServer = fcgi.createServer(async function delayedRead(req, res) {
            await new Promise(r => setTimeout(r, 400));

            let reqBody = "";

            req.on('data', (data) => { reqBody += data.toString(); });

            req.on('end', () => {
                try {
                    const length = Buffer.byteLength(reqBody, "utf8");

                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Content-Length': length
                    });
                    res.end(reqBody);
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
                fcgiHandler.connect({
                    __proto__: fcgiAddr,
                    noDelay: true
                }, (err, fcgiProcess) => {
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

    it('should answer with the request body', async () => {
        const reqBody1 = "Hello ";
        const reqBody2 = "World!";

        const res = await new Promise((resolve, reject) => {
            try {
                const req = http.request(httpURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': "text/plain; charset=utf8"
                    },
                    noDelay: true,
                    signal: timeoutSignal(1000)
                }, resolve);

                req.on('error', reject);

                req.write(reqBody1);

                setTimeout(() => {
                    try {
                        req.write(reqBody2);
                        req.end();
                    } catch (err) {
                        reject(err);
                    }
                }, 800);
            } catch (err) {
                reject(err);
            }
        });

        expect(res.statusCode).to.be.equal(200);

        let body = "";
        for await (const chunk of res)
            body += chunk;

        expect(body).to.be.equal(reqBody1 + reqBody2);
    });
});
