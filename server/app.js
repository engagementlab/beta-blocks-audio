var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var multer = require('multer');

var app = express();

const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

/**
 * NodeJS Module dependencies.
 */
const {
  Readable
} = require('stream');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


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
MongoClient.connect('mongodb://localhost/beta-blocks-audio', (err, database) => {
  if (err) {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
    process.exit(1);
  }
  db = database;
});

var memory = multer.memoryStorage();
var upload = multer({
  storage: memory
});

app.post('/api/upload', upload.single('file'), function (req, res) {

  const readableTrackStream = new Readable();
  readableTrackStream.push(req.file.buffer);
  readableTrackStream.push(null);

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: 'tracks'
  });

  let uploadStream = bucket.openUploadStream('audio-' + Date.now() + '.wav');
  let id = uploadStream.id;
  readableTrackStream.pipe(uploadStream);

  uploadStream.on('error', () => {
    return res.status(500).json({
      message: "Error uploading file"
    });
  });

  uploadStream.on('finish', () => {
    return res.status(201).json({
      message: "File uploaded successfully, stored under Mongo ObjectID: " + id
    });
  });

});

app.get('/api/download/:id', (req, res) => {

  try {
    var trackID = new ObjectID(req.params.id);
  } catch (err) {
    return res.status(400).json({
      message: "Invalid trackID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters"
    });
  }

  res.set('content-type', 'audio/mp3');
  res.set('accept-ranges', 'bytes');

  let bucket = new mongodb.GridFSBucket(db, {
    bucketName: 'tracks'
  });
  // bucket.find().toArray().then((data) => {
  //   // Here you can do something with your data
  //   result = data.toArray()
  //   console.log(result)
  // })
  // bucket.find().ap
  // 
  // async function getResults() {
  //   bucket.find();
  // }

  // var results = await getResults();
  // results = results.toArray();
  // console.log(results)
  let downloadStream = bucket.openDownloadStream(trackID);

  // downloadStream.on('data', (chunk) => {
  //   res.write(chunk);
  // });

  // downloadStream.on('error', () => {
  //   res.sendStatus(404);
  // });

  // downloadStream.on('end', () => {
  //   res.end();
  // });
});

app.get('/api/list', (req, res) => {

  db.collection('tracks.files').find({}, {_id: 1}).toArray(function(err, result) {
    
    if (err) throw err;
  
    res.status(200).send(result);
    
  });

})

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  if (err) console.error(err);

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;