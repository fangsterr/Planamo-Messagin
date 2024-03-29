var http = require('http');
var amqp = require('amqp');
var URL = require('url');
var htmlEscape = require('sanitizer/sanitizer').escape;

function rabbitUrl() {
    return process.env.CLOUDAMQP_URL || "amqp://localhost";
}

var port = process.env.PORT || 3000;

var messages = [];

function setup() {

  var exchange = conn.exchange('cf-demo', {'type': 'fanout', durable: false}, function() {

    var queue = conn.queue('my-queue', {durable: false, exclusive: false},
    function() {
      queue.subscribe(function(msg) {
        console.log(msg);
        if (msg.data) {
            console.log(msg.data.toString());
            message = msg.data.toString();
        } else {
            message = msg.body;
        }
        messages.push(htmlEscape(message));
        if (messages.length > 10) {
          messages.shift();
        }
      });
      console.log(exchange.name);
      queue.bind(exchange.name, '');
    });
    queue.on('queueBindOk', function() { httpServer(exchange); });
  });
}

function httpServer(exchange) {
  var serv = http.createServer(function(req, res) {
    var url = URL.parse(req.url);
    if (req.method == 'GET' && url.pathname == '/env') {
      printEnv(res);
    }
    else if (req.method == 'GET' && url.pathname == '/') {
      res.statusCode = 200;
      openHtml(res);
      writeForm(res);
      writeMessages(res);
      closeHtml(res);
    }
    else if (req.method == 'POST' && url.pathname == '/') {
      chunks = '';
      req.on('data', function(chunk) { chunks += chunk; });
      req.on('end', function() {
        msg = unescapeFormData(chunks.split('=')[1]);
        exchange.publish('', {body: msg});
        res.statusCode = 303;
        res.setHeader('Location', '/');
        res.end();
      });
    }
    else {
      res.statusCode = 404;
      res.end("This is not the page you were looking for.");
    }
  });
  serv.listen(port);
}

console.log("Starting ... AMQP URL: " + rabbitUrl());
console.log("Port listening on: " + port);
var conn = amqp.createConnection({url: rabbitUrl()});
conn.on('ready', setup);

// ---- helpers

function openHtml(res) {
  res.write("<html><head><title>Node.js / RabbitMQ demo</title></head><body>");
}

function closeHtml(res) {
  res.end("</body></html>");
}

function writeMessages(res) {
  res.write('<h2>Messages</h2>');
  res.write('<ol>');
  for (i in messages) {
    res.write('<li>' + messages[i] + '</li>');
  }
  res.write('</ol>');
}

function writeForm(res) {
  res.write('<form method="post">');
  res.write('<input name="data"/><input type="submit"/>');
  res.write('</form>');
}

function printEnv(res) {
  res.statusCode = 200;
  openHtml(res);
  for (entry in process.env) {
    res.write(entry + "=" + process.env[entry] + "<br/>");
  }
  closeHtml(res);
}

function unescapeFormData(msg) {
  return unescape(msg.replace('+', ' '));
}