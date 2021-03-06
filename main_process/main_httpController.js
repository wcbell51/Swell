const { ipcMain } = require("electron");

const fetch2 = require("node-fetch");
//const { session } = require("electron").remote;
const http2 = require("http2");

// parsing through cookies
const setCookie = require("set-cookie-parser");

//Included Functions
const SSEController = require("./SSEController");

// openHTTPconnection(reqResObj, connectionArray)
// establishHTTP2Connection(reqResObj, connectionArray)
// attachRequestToHTTP2Client(client, reqResObj, connectionArray)
// makeFetch(args)
// establishHTTP1connection(reqResObj, connectionArray)
// parseFetchOptionsFromReqRes(reqResObject)
// addSingleEvent(response, originalObj, headers)
// handleSSE(response, originalObj, headers)
// parseSSEFields(rawString)
// cookieFormatter(setCookie(response.cookies))

const httpController = {
  openHTTP2Connections: [],

  // ----------------------------------------------------------------------------

  openHTTPconnection(event, reqResObj, connectionArray) {
    // HTTP2 currently only on HTTPS
    reqResObj.protocol === "https://"
      ? httpController.establishHTTP2Connection(
          event,
          reqResObj,
          connectionArray
        )
      : httpController.establishHTTP1connection(
          event,
          reqResObj,
          connectionArray
        );
  },

  // ----------------------------------------------------------------------------

  establishHTTP2Connection(event, reqResObj, connectionArray) {
    /*
      Attempt to find an existing HTTP2 connection in openHTTP2Connections Array.
      If exists, use connection to initiate request
      If not, create connection, push to array, and then initiate request
    */
    // finds if an http2connection to host exist, returns blank if no host connection exists
    const foundHTTP2Connection = httpController.openHTTP2Connections.find(
      (conn) => conn.host === reqResObj.host
    );

    // EXISTING HTTP2 CONNECTION IS FOUND -----
    let interval;

    //if the connection is exist, check if destroyed/closed
    if (foundHTTP2Connection) {
      const { client } = foundHTTP2Connection;

      // periodically check if the client is open or destroyed, and attach if conditions are met
      interval = setInterval(() => {
        // if failed, could because of protocol error. try HTTP1
        // if destroyed, remove from the conections array and try to create a newhttp2 connection
        // create a new connection / http1?
        if (client.destroyed || client.closed) {
          clearInterval(interval);
          this.openHTTP2Connections = this.openHTTP2Connections.filter(
            (obj, i) => {
              return obj.host !== reqResObj.host;
            }
          );
          this.openHTTPconnection(event, reqResObj, connectionArray);
        } else if (foundHTTP2Connection.status === "failed") {
          clearInterval(interval);
          httpController.establishHTTP1connection(
            event,
            reqResObj,
            connectionArray
          );
        } else if (foundHTTP2Connection.status === "connected") {
          clearInterval(interval);
          this.attachRequestToHTTP2Client(
            client,
            event,
            reqResObj,
            connectionArray
          );
        }
      }, 50);
      // --------------------------------------------------
      // if hasnt changed in 10 seconds, mark as error
      // --------------------------------------------------
      setTimeout(() => {
        clearInterval(interval);
        if (foundHTTP2Connection.status === "initialized") {
          reqResObj.connection = "error";
          // SEND BACK REQ RES OBJECT TO RENDERER SO IT CAN UPDATE REDUX STORE
          event.sender.send("reqResUpdate", reqResObj);
        }
      }, 10000);
    }
    // --------------------------------------------------
    // NO EXISTING HTTP2 CONNECTION - make it before attaching request
    // --------------------------------------------------
    else {
      // console.log('New HTTP2 Conn:', reqResObj.host);
      console.log("no pre-existing http2 found");
      const id = Math.random() * 100000;
      const client = http2.connect(reqResObj.host, () =>
        console.log("connected!, reqRes.Obj.host", reqResObj.host)
      );

      // push HTTP2 connection to array
      const http2Connection = {
        client,
        id,
        host: reqResObj.host,
        status: "initialized",
      };
      httpController.openHTTP2Connections.push(http2Connection);

      client.on("error", (err) => {
        console.log("HTTP2 FAILED...trying HTTP1\n", err);
        http2Connection.status = "failed";
        client.destroy();
        // if it exists in the openHTTP2Connections array, remove it
        httpController.openHTTP2Connections = httpController.openHTTP2Connections.filter(
          (conn) => conn.id !== id
        );

        // need to filter connectionArray for existing connObj as a nonfunctioning
        // one may have been pushed in establishHTTP2connection...
        // can't actually use filter though due to object renaming
        connectionArray.forEach((obj, i) => {
          if (obj.id === reqResObj.id) {
            connectionArray.splice(i, 1);
          }
        });

        // try again with fetch (HTTP1);
        httpController.establishHTTP1connection(
          event,
          reqResObj,
          connectionArray
        );
      });

      client.on("connect", () => {
        http2Connection.status = "connected";
        console.log("about to attach request to http 2 client");
        // attach request, again passing in event so we can send response to renderer with event.sender.send()
        this.attachRequestToHTTP2Client(
          client,
          event,
          reqResObj,
          connectionArray
        );
      });
    }
  },

  // ----------------------------------------------------------------------------

  attachRequestToHTTP2Client(client, event, reqResObj, connectionArray) {
    // start off by clearing existing response data
    reqResObj.response.headers = {};
    reqResObj.response.events = [];
    reqResObj.connection = "pending";
    reqResObj.timeSent = Date.now();
    // send back reqResObj to renderer so it can update the redux store
    event.sender.send("reqResUpdate", reqResObj);

    // format headers in chosen reqResObj so we can add them to our request
    const formattedHeaders = {};
    reqResObj.request.headers.forEach((head) => {
      formattedHeaders[head.key] = head.value;
    });
    formattedHeaders[":path"] = reqResObj.path;

    // initiate request
    const reqStream = client.request(formattedHeaders, {
      // do not immediately close the *writable* side of the http2 stream (i.e. what the request sends over), in case we are using a request method that sends a payload body
      endStream: false,
    });

    //we can now close the writable side of our stream, either sending our request body or not, depending on our method
    //if method is not a get request, end stream and send reqResObj.request.body
    if (
      reqResObj.request.method !== "GET" &&
      reqResObj.request.method !== "HEAD"
    ) {
      console.log("if this fires soemthing unexpected is happening");
      reqStream.end(reqResObj.request.body);
    } else {
      console.log("ending request");
      reqStream.end();
    }

    // create an object that represents our open connection.
    const openConnectionObj = {
      stream: reqStream,
      protocol: "HTTP2",
      id: reqResObj.id,
    };

    // this is the connection array that was passed into these controller functions from reqResController.js
    connectionArray.push(openConnectionObj);

    let isSSE;

    reqStream.on("response", (headers, flags) => {
      console.log("GOT BACK A RESPONSE, HALLELUJAH");
      // first argumnet of callback to response listener in ClientHttp2Stream is an object containing the receieved HTTP/2 Headers Object, as well as the flags associated with those headers
      console.log("headers from line 178 is : ", headers);
      // SSE will have 'stream' in the 'content-type' heading
      isSSE =
        headers["content-type"] && headers["content-type"].includes("stream");

      if (isSSE) {
        reqResObj.connection = "open";
        reqResObj.connectionType = "SSE";
      } else {
        reqResObj.connection = "closed";
        reqResObj.connectionType = "plain";
      }
      reqResObj.isHTTP2 = true;
      reqResObj.timeReceived = Date.now();
      reqResObj.response.headers = headers;

      // if cookies exists, parse the cookie(s)
      if (setCookie.parse(headers["set-cookie"])) {
        reqResObj.response.cookies = this.cookieFormatter(
          setCookie.parse(headers["set-cookie"])
        );
        // send back reqResObj to renderer so it can update the redux store
      }
      event.sender.send("reqResUpdate", reqResObj);
    });

    reqStream.setEncoding("utf8");
    let data = "";
    reqStream.on("data", (chunk) => {
      console.log("is this a server sent event? ", isSSE);
      data += chunk;
      if (isSSE) {
        let couldBeEvents = true;
        const wouldBeTimeReceived = Date.now();

        while (couldBeEvents) {
          const possibleEventArr = data.match(/[\s\S]*\n\n/g);

          // if the array has a match, send it to be parsed, and send back to store
          if (possibleEventArr && possibleEventArr[0]) {
            const receivedEventFields = httpController.parseSSEFields(
              possibleEventArr[0]
            );
            receivedEventFields.timeReceived = wouldBeTimeReceived;

            reqResObj.response.events.push(receivedEventFields);
            // send back reqResObj to renderer so it can update the redux store
            event.sender.send("reqResUpdate", reqResObj);

            // splice possibleEventArr, recombine with \n\n to reconstruct original,
            // minus what was already parsed.
            possibleEventArr.splice(0, 1);
            data = possibleEventArr.join("\n\n");
          }
          // if does not contain, end while loop
          else {
            couldBeEvents = false;
          }
        }
      }
    });
    reqStream.on("end", () => {
      if (isSSE) {
        const receivedEventFields = this.parseSSEFields(data);

        receivedEventFields.timeReceived = Date.now();
        reqResObj.connection = "closed";
        reqResObj.response.events.push(receivedEventFields);
        // send back reqResObj to renderer so it can update the redux store
        event.sender.send("reqResUpdate", reqResObj);
      } else {
        reqResObj.connection = "closed";
        //conditional to parse JSON only when the content-type is JSON, otherwise leave data
        data =
          data &&
          reqResObj.response.headers["content-type"].includes(
            "application/json"
          )
            ? JSON.parse(data)
            : data;
        //parse into JSON if contents are JSON
        reqResObj.response.events.push(data);
        // send back reqResObj to renderer so it can update the redux store
        event.sender.send("reqResUpdate", reqResObj);
      }
    });
  },
  // ----------------------------------------------------------------------------

  makeFetch(args, event, reqResObj) {
    return new Promise((resolve) => {
      //   ipcRenderer.send("http1-fetch-message", args);
      //   ipcRenderer.on("http1-fetch-reply", (event, result) => {
      //     resolve(result);
      //   });
      const { method, headers, body } = args.options;
      console.log("args", args);
      fetch2(headers.url, { method, headers, body })
        .then((response) => {
          const headers = response.headers.raw();
          // check if the endpoint sends SSE
          // add status code for regular http requests in the response header

          if (headers["content-type"][0].includes("stream")) {
            // invoke another func that fetches to SSE and reads stream
            // params: method, headers, body
            resolve({
              headers,
              body: { error: "This Is An SSE endpoint" },
            });
          }
          headers[":status"] = response.status;

          const receivedCookie = headers["set-cookie"];
          headers.cookies = receivedCookie;

          const contents = /json/.test(response.headers.get("content-type"))
            ? response.json()
            : response.text();
          contents
            .then((body) => {
              resolve({
                headers,
                body,
              });
            })
            .catch((error) =>
              console.log("ERROR from makeFetch contents", error)
            );
        })
        .catch((error) => {
          //error in connections
          reqResObj.connection = "error";
          reqResObj.error = error;
          reqResObj.response.events.push(JSON.stringify(error));
          event.sender.send("reqResUpdate", reqResObj);
        });
    });
  },
  // ----------------------------------------------------------------------------

  establishHTTP1connection(event, reqResObj, connectionArray) {
    console.log("event306", event);
    // start off by clearing existing response data, and make note of when response was created
    reqResObj.response.headers = {};
    reqResObj.response.events = [];
    reqResObj.connection = "pending";
    reqResObj.timeSent = Date.now();
    // send back reqResObj to renderer so it can update the redux store
    event.sender.send("reqResUpdate", reqResObj);

    connectionArray.forEach((obj, i) => {
      if (obj.id === reqResObj.id) {
        connectionArray.splice(i, 1);
      }
    });

    const openConnectionObj = {
      protocol: "HTTP1",
      id: reqResObj.id,
    };
    connectionArray.push(openConnectionObj);

    const options = this.parseFetchOptionsFromReqRes(reqResObj);

    //--------------------------------------------------------------------------------------------------------------
    // Check if the URL provided is a stream
    //--------------------------------------------------------------------------------------------------------------
    if (reqResObj.request.isSSE) {
      // if so, send us over to SSEController
      SSEController.createStream(reqResObj, options, event);
      // if not SSE, talk to main to fetch data and receive
    } else {
      this.makeFetch({ options }, event, reqResObj)
        .then((response) => {
          // Parse response headers now to decide if SSE or not.
          const heads = response.headers;
          reqResObj.response.headers = heads;
          reqResObj.connection = "closed";
          reqResObj.timeReceived = Date.now();
          // send back reqResObj to renderer so it can update the redux store
          event.sender.send("reqResUpdate", reqResObj);

          const theResponseHeaders = response.headers;

          const { body } = response;
          reqResObj.response.headers = theResponseHeaders;

          // if cookies exists, parse the cookie(s)
          if (setCookie.parse(theResponseHeaders.cookies)) {
            reqResObj.response.cookies = this.cookieFormatter(
              setCookie.parse(theResponseHeaders.cookies)
            );
          }
          // update reqres object to include new event
          reqResObj = this.addSingleEvent(body, reqResObj);
          // send back reqResObj to renderer so it can update the redux store
          event.sender.send("reqResUpdate", reqResObj);
        })
        .catch((err) => {
          reqResObj.connection = "error";
          // send back reqResObj to renderer so it can update the redux store
          event.sender.send("reqResUpdate", reqResObj);
        });
    }
  },

  // ----------------------------------------------------------------------------

  parseFetchOptionsFromReqRes(reqResObject) {
    const { headers, body, cookies } = reqResObject.request;
    let { method } = reqResObject.request;

    method = method.toUpperCase();

    const formattedHeaders = {
      url: reqResObject.url,
    };
    headers.forEach((head) => {
      if (head.active) {
        formattedHeaders[head.key] = head.value;
      }
    });

    cookies.forEach((cookie) => {
      const cookieString = `${cookie.key}=${cookie.value}`;
      // attach to formattedHeaders so options object includes this
      formattedHeaders.cookie = cookieString;
    });

    const outputObj = {
      method,
      mode: "cors", // no-cors, cors, *same-origin
      cache: "no-cache", // *default, no-cache, reload, force-cache, only-if-cached
      credentials: "include", // include, *same-origin, omit
      headers: formattedHeaders,
      redirect: "follow", // manual, *follow, error
      referrer: "no-referrer", // no-referrer, *client
    };

    if (method !== "GET" && method !== "HEAD") {
      outputObj.body = body;
    }

    return outputObj;
  },

  // ----------------------------------------------------------------------------

  addSingleEvent(event, reqResObj) {
    // adds new event to reqResObj and returns it so obj can be sent back to renderer process
    reqResObj.timeReceived = Date.now();
    reqResObj.response.events.push(event);
    reqResObj.connectionType = "plain";
    // returns updated reqResObj
    return reqResObj;
  },

  cookieFormatter(cookieArray) {
    return cookieArray.map((eachCookie) => {
      const cookieFormat = {
        name: eachCookie.name,
        value: eachCookie.value,
        domain: eachCookie.domain,
        hostOnly: eachCookie.hostOnly ? eachCookie.hostOnly : false,
        path: eachCookie.path,
        secure: eachCookie.secure ? eachCookie.secure : false,
        httpOnly: eachCookie.httpOnly ? eachCookie.httpOnly : false,
        session: eachCookie.session ? eachCookie.session : false,
        expirationDate: eachCookie.expires ? eachCookie.expires : "",
      };
      return cookieFormat;
    });
  },
};

module.exports = () => {
  // creating our event listeners for IPC events
  ipcMain.on("open-http", (event, reqResObj, connectionArray) => {
    // we pass the event object into these controller functions so that we can invoke event.sender.send when we need to make response to renderer process
    httpController.openHTTPconnection(event, reqResObj, connectionArray);
  });
};
