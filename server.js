/**
 * @fileOverview EventSource Chat server
 *
 * @author azproduction
 */

// Подключаем необходимые модули
var http = require('http'),
    fs = require('fs'),
    parse = require('url').parse;

// Кэшируем статику
var indexFile = fs.readFileSync('index.html'); // Buffer

/**
 * Синглентон, управляющий клиентами
 *
 * @namespace
 */
var Clients = {
    /**
     * Дескрипторы клиентов
     *
     * @type Object[]
     */
    _clients: [],

    /**
     * Количество клиентов онлайн
     *
     * @type Number
     */
    count: 0,

    /**
     * Удаляем клиента
     * 
     * @param {Number} clientId
     */
    remove: function (clientId) {
        // Если клиента нет, то ничего не делаем
        var client = this._clients[clientId];
        if (!client) {
            return;
        }
        // Закрываем соединение
        client.response.end();
        // Удаляем клиента
        delete this._clients[clientId];
        this.count--;
        
        // Сообщаем всем оставшимся, что он вышел
        // Рассылаем сообщения от имени бота
        this.broadcast(client.name + ' offline', '@ChatBot', true);
    },

    /**
     * Добавляем клиента
     *
     * @param {Number}   clientId
     * @param {Response} response
     * @param {String}   name
     */
    add: function (clientId, response, name) {
        this._clients[clientId] = {response: response, name: name || 'anonymous'};
        this.count++;

        // Рассылаем сообщения от имени бота
        this.unicast(clientId, 'Hello, ' + name + '! Online ' + this.count, '@ChatBot', true);
        this.broadcast(name + ' online', '@ChatBot', true);
    },

    /**
     * Рассылаем всем сообщение
     *
     * @param {String}  message
     * @param {String}  name
     * @param {Boolean} isbot
     */
    broadcast: function (message, name, isbot) {
        this._send(this._clients, message, name, isbot);
    },

    /**
     * Отправляем сообщение одному клиенту
     *
     * @param {Number}  clientId
     * @param {String}  message
     * @param {String}  name
     * @param {Boolean} isbot
     */
    unicast: function (clientId, message, name, isbot) {
        var client = this._clients[clientId];
        if (!client) {
            return;
        }

        this._send([client], message, name, isbot);
    },

    /**
     * Общий метод для отправки сообщений
     *
     * @param {Object[]} clients
     * @param {String}   message
     * @param {String}   name
     * @param {Boolean}  isbot
     */
    _send: function (clients, message, name, isbot) {
        // Подготавливаем сообщение
        var data = JSON.stringify({
            message: message.substr(0, 1000),
            name: (name || 'anonymous').substr(0, 20),
            isbot: isbot || false
        });

        // Создаем новый буфер, чтобы при большом количестве клиентов
        // Отдача была более быстрой из-за особенностей архитектуры Node.js
        data = new Buffer("data: " + data + "\n\n", 'utf8');

        // Рассылаем всем
        clients.forEach(function (client) {
            client.response.write(data); // Отсылаем буфер
        });
    },

    /**
     * Метод для получения ид следующего клиента
     */
    generateClientId: function () {
        return this._clients.length;
    }
};

// Роуты
var Routes = {

    // Индексная страница, просто шлем статику
    'GET /': function (request, response) {
        // Шлем правильные заголовки
        response.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
        response.write(indexFile);
        response.end();
    },

    // Событие
    'GET /event': function (request, response) {
        var url = parse(request.url, true);
        var name = (url.query.name || 'anonymous').substr(0, 20);
        var clientId = Clients.generateClientId();

        // Шлем спец заголовок для EventSource
        response.writeHead(200, {'Content-Type': 'text/event-stream'});

        // Выставляем больший таймаут на сокет, иначе сокет запроется через 2 минуты
        request.socket.setTimeout(1000 * 60 * 60); // 1 Час

        // Если соединение упало - удаляем этого клиента
        request.on('close', function () {
            Clients.remove(clientId);
        });

        // Добавляем клиента в список
        Clients.add(clientId, response, name);
    },

    // Сообщение (Сделал через GET потому, что так проще в Node.js)
    'GET /message': function (request, response) {
        var url = parse(request.url, true);

        // Рассылаем всем сообщение
        Clients.broadcast(url.query.message, url.query.name, false);
        response.writeHead(200);
        response.end();
    },

    // Страница 404
    $: function (request, response) {
        response.writeHead(404);
        response.end();
    }
};

// Создаем сервер
var httpServer = http.createServer(function (request, response) {
    var key = request.method + ' ' + parse(request.url).pathname;

    // Если роута нет, то отдаем по умолчанию Routes.$ - 404
    (Routes[key] || Routes.$)(request, response);
});

// Включаем сервер
httpServer.listen(80);
console.log('Online');