require('dotenv').config();

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var multer = require('multer');

const app = express(),
  fs = require('fs');

const mongodb = require('mongodb');
const GridStream = require('gridfs-stream');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID,
  dateFormat = require('dateformat'),
  axios = require('axios'),
  FormData = require('form-data');;

const {
  WebClient
} = require('@slack/web-api');
const slackWeb = new WebClient(process.env.SLACK_TOKEN);

/**
 * NodeJS Module dependencies.
 */
const {
  Readable
} = require('stream');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());

// Setup Route Bindings 
// CORS
app.all('/*', function (req, res, next) {

  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD, PUT');
  res.header('Access-Control-Expose-Headers', 'Content-Length');
  res.header("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method");

  if (req.method === 'OPTIONS')
    res.sendStatus(200);
  else
    next();

});

/**
 * Connect Mongo Driver to MongoDB.
 */
let db;
let gfs;
MongoClient.connect('mongodb://localhost/beta-blocks-audio', (err, database) => {
  if (err) {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
    process.exit(1);
  }
  db = database;
  gfs = GridStream(db, mongodb);
});

var memory = multer.memoryStorage();
var upload = multer({
  storage: memory
});

app.post('/api/upload', upload.single('file'), async (req, res) => {

  const fileName = 'bb-audio-' + req.body.datetime + '.wav';
  const readableTrackStream = new Readable();

  let uploadStream;
  let fileId;

  let save = new Promise((resolve, reject) => {

    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    });

    uploadStream = bucket.openUploadStream(fileName, {
      metadata: {
        approved: false,
        latlng: req.body.latlng
      }
    });
    fileId = uploadStream.id;

    readableTrackStream.push(req.file.buffer);
    readableTrackStream.push(null);

    uploadStream.on('error', (err) => {
      reject();
      return res.status(500).json({
        message: "Error uploading file: " + err
      });
    });

    uploadStream.on('finish', () => {
      resolve();
    });

    readableTrackStream.pipe(uploadStream);

  });

  let notify = new Promise((resolve, reject) => {

    const fileNameFormatted = 'bb-audio_' + dateFormat(Date(req.body.datetime), 'mm-d-yy h:MM:sstt') + '.wav';

    const form = new FormData();
    form.append('token', process.env.SLACK_TOKEN);
    form.append('channels', process.env.SLACK_CHANNEL);
    form.append('file', readableTrackStream, fileNameFormatted);

    return axios.post('https://slack.com/api/files.upload', form, {
      headers: form.getHeaders()
    }).then(async (response) => {

      let msg = "Please listen to submitted audio above and approve or delete. (_" + fileNameFormatted + "_) *Please note:* deletion is not currently reversable!";
      await slackWeb.chat.postMessage({
        text: '',
        channel: process.env.SLACK_CHANNEL,
        blocks: [{
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": msg
            }
          },
          {
            "type": "actions",
            "elements": [{
                "type": "button",
                "action_id": "approve",
                "text": {
                  "type": "plain_text",
                  "text": "Approve",
                  "emoji": false
                },
                "style": "primary",
                "value": fileId
              },
              {
                "type": "button",
                "action_id": "delete",
                "text": {
                  "type": "plain_text",
                  "text": "Delete",
                  "emoji": false
                },
                "style": "danger",
                "value": fileId
              }
            ]
          }
        ]
      });

      resolve();
    });

  });

  await Promise.all([save, notify])
    .catch((e) => {
      console.error('error', e)
    });
  return res.status(201).send('done');

});

// Thanks: https://medium.com/@richard534/uploading-streaming-audio-using-nodejs-express-mongodb-gridfs-b031a0bcb20f
app.get('/api/download/:id', (req, res) => {

  try {
    var trackId = new ObjectID(req.params.id);
  } catch (err) {
    return res.status(400).json({
      message: "Invalid trackId in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters"
    });
  }

  res.set('content-type', 'audio/wav');
  res.set('accept-ranges', 'bytes');

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: 'tracks'
  });

  let downloadStream = bucket.openDownloadStream(trackId);

  downloadStream.on('data', (chunk) => {
    res.write(chunk);
  });

  downloadStream.on('error', (err) => {
    console.log(err)
    res.sendStatus(404);
  });

  downloadStream.on('end', (data) => {
    res.end();
  });
});

app.get('/api/list', (req, res) => {

  db.collection('tracks.files').find({
    'metadata.approved': true
  }, {
    _id: 1
  }).toArray(function (err, result) {

    if (err) throw err;

    res.status(200).send(result);

  });

});

app.post('/api/response', async (req, res) => {

  try {

    let response = JSON.parse(req.body.payload);
    let action = response.actions[0];
    let userName = response.user.name;
    let timestamp = response.message.ts;

    let objectID = require('mongodb').ObjectID;
    let record = {
      '_id': objectID(action.value)
    };

    if (action.action_id === 'approve') {
      let update = {
        $set: {
          'metadata.approved': true
        }
      };
      db.collection('tracks.files').updateOne(record, update, async (err, result) => {

        if (err) {
          console.error(err)
          await slackWeb.chat.update({
            text: 'Error! Let @johnny know ASAP! And then bring him whiskey!!',
            channel: process.env.SLACK_CHANNEL,
          });
        } else {
          await slackWeb.chat.update({
            text: '@' + userName + ' approved this audio.',
            channel: process.env.SLACK_CHANNEL,
            blocks: [],
            ts: timestamp,
            link_names: true
          });
        }

        if (err) res.sendStatus(500);
        res.sendStatus(200)

      });
    } else {
      console.log('delete ' + record)
      db.collection('tracks.files').deleteOne(record, async (err, result) => {

        let msg = err ? 'Error! Let @johnny know ASAP! And then bring him beer!! (This audio is still not approved, don\'t worry)' : '@' + userName + ' deleted this audio.';
        let bodyObj = {
          text: msg,
          channel: process.env.SLACK_CHANNEL,
          blocks: [],
          ts: timestamp,
          link_names: true
        };

        // TODO: Don't remove buttons if fail in case of connection drop; we'll assume for now stable connection
        // if(test) bodyObj.blocks = response.message.blocks;
        await slackWeb.chat.update(bodyObj);

        if (err) res.sendStatus(500);
        res.sendStatus(200);

      });
    }
  } catch (e) {

    console.error(e)

    return res.status(500).json({
      message: e
    });

  }

});

module.exports = app;