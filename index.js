var server = require('./lib/server.js');
var response = require('./lib/response.js');

exports.Server = server.Server;
exports.Request = require('./lib/request.js').Request;
exports.Response = response.Response;
exports.AuthorizerResponse = response.AuthorizerResponse;
exports.FilterResponse = response.FilterResponse;

// NOTE: http module compatibility
exports.IncomingMessage = exports.Request;
exports.ServerResponse = exports.Response;

/**
 * function createServer([responder], [authorizer], [filter], [config])
 * Creates and returns a FastCGI server object. Compatible with http.createServer
 * 
 * Arguments:
 *   - responder (optional): callback for FastCGI responder requests (normal HTTP requests, 'request' event)
 *   - authorizer (optional): callback for FastCGI authorizer requests ('authorize' event)
 *   - filter (optional): callback for FastCGI filter requests ('filter' event)
 *   - config (optional): server configuration (default: { maxConns: 2000, maxReqs: 2000, multiplex: true, valueMap: {} })
 */

exports.createServer = function(responder, authorizer, filter, config) {
  return new server.Server(responder, authorizer, filter, config);
}
