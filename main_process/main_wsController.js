const { ipcMain } = require("electron");
// const store = require('./src/client/store.js')
const WebSocketClient = require('websocket').client

const wsController = {
	wsConnect: null,
  openWSconnection(event, reqResObj, connectionArray) {
		//set reqResObj for WS
		reqResObj.response.messages = [];
		reqResObj.request.messages = [];
		reqResObj.connection = 'pending';
		reqResObj.closeCode = 0;
		reqResObj.timeSent = Date.now();

		//update frontend its pending
		event.sender.send("reqResUpdate", reqResObj);

		//create socket
		let socket;
		try {
			socket = new WebSocketClient()
		}
		catch (err) {
			reqResObj.connection = 'error';
			event.sender.send("reqResUpdate", reqResObj);
			return;
		}

		//when it connects, update connectionArray
		socket.on('connect', (connection) => {
			this.wsConnect = connection;
			reqResObj.connection = 'open';
			const openConnectionObj = {
				connection,
				protocol: 'WS',
				id: reqResObj.id,
			};
			connectionArray.push(openConnectionObj);
			event.sender.send("update-connectionArray", connectionArray);
			event.sender.send("reqResUpdate", reqResObj);
			this.wsConnect.on('close', () => {
        console.log('closed WS');
			});			
		});

		//listener for failed socket connection,
		socket.on('connectFailed', (error) => {
			console.log('WS Connect Error: ' + error.toString());
			reqResObj.connection = "error";
    	reqResObj.timeReceived = Date.now();
    	// reqResObj.response.events.push(JSON.stringify(errorsObj));
			event.sender.send("reqResUpdate", reqResObj);
		});

		//connect socket
		socket.connect(reqResObj.url);
	},

	closeWs(event) {
		this.wsConnect.close();
	},

	sendWebSocketMessage(event, reqResObj, inputMessage) {
		//send message to ws server
		this.wsConnect.send(inputMessage);

		//push sent message to reqResObj message array as a request message
		reqResObj.request.messages.push({
			data: inputMessage,
			timeReceived: Date.now(),
		});
		
		//update store
		event.sender.send("reqResUpdate", reqResObj);

		//listener for return message from ws server
		//push into message array under responses
		this.wsConnect.on('message', (e) => {
			reqResObj.response.messages.push({
				data: e.utf8Data,
				timeReceived: Date.now(),
			});
			//update store
			event.sender.send("reqResUpdate", reqResObj);
		});
	},
};
module.exports = () => {
		// we pass the event object into these controller functions so that we can invoke event.sender.send when we need to make response to renderer process
    // listener to open wsconnection
    ipcMain.on("open-ws", (event, reqResObj, connectionArray) => {
      wsController.openWSconnection(event, reqResObj, connectionArray);
		});
		//listener for sending messages to server
    ipcMain.on("send-ws", (event, reqResObj, inputMessage) => {
      wsController.sendWebSocketMessage(event, reqResObj, inputMessage);
		});
		//listerner to close socket connection
		ipcMain.on("close-ws", (event) => {
			wsController.closeWs(event);
		})
  };