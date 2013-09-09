var config = require('./config'),
  sys = require('sys'),
  express = require('express'),
  routes = require('./routes'),
  fs = require('fs'),
  http = require('http'),
  async = require('async'),
  admzip = require('adm-zip'),
  xml2js = require('xml2js'),
  mongoose = require('mongoose'),
  azure = require('azure'),
  loggly = require('loggly');

var logglyConfig = {
  subdomain: "mediusflow",
  json: true
};

var logglyClient = loggly.createClient(logglyConfig);
var app = express();
var server = http.createServer(app);

function logHandler(severity, type, text) {
  var logglyObject = {
    severity: severity,
    type: type,
    text: text
  };
  console.log('Severity: ' + severity + ', Type: ' + type + ', Text: ' + JSON.stringify(text));
  logglyClient.log('58b1ea55-68e6-4cb0-be26-413db821c458', logglyObject);
}

function logErrors(err, req, res, next) {
  logHandler('ERROR', 'Nodejs', err.stack);
  next(err);
}

function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.send(500, { error: 'Something blew up!' });
  } else {
    next(err);
  }
}

function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}

function apiErrorHandler(err, req, res, next) {
  res.statusCode = 400;
  res.writeHead(res.statusCode, { 'Content-Type': 'text/plain' });
  res.end(err);
}

function logWebRequest(req) {
  var logObject = {
    url: req.url,
    method : req.method
  };
  logHandler('INFO', 'Express', logObject);
}

logHandler('INFO', 'Nodejs', 'Start Nodejs process');

var blobService = azure.createBlobService(config.azure_storage_username, config.azure_storage_key, config.azure_storage_URL_base)
  .withFilter(new azure.ExponentialRetryPolicyFilter());

//Mongoose
var mongoDB = mongoose.createConnection(config.mongodb_connectionString, {
    server: {
      auto_reconnect: true,
      poolSize: 10,
      socketOptions: {
        keepAlive: 1
      }
    },
    db: {
      numberOfRetries: 10,
      retryMiliSeconds: 1000
    }
  }, function (err, res) {
    if (err) {
      logHandler('ERROR', 'MongoDB', 'ERROR connecting to MongoDB: ' + err);
    } else {
      logHandler('INFO', 'MongoDB', 'Succeeded connected to MongoDB.');
    }
  });

mongoDB.on('error', function (err) {
  logHandler('ERROR', 'MongoDB', "DB connection Error: " + err);
});

mongoDB.on('open', function () {
  logHandler('INFO', 'MongoDB', 'Connection opened.');
});

mongoDB.on('close', function (str) {
  logHandler('INFO', 'MongoDB', 'Connection closed: ' + str);
});

var Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

var applicationSchema = new Schema({
  name: String,
  friendlyName: String,
  description: String,
  imageUrl: String,
  category: String,
  keywords: [String],
  versions: [{
    version: String,
    downloadUrl: String,
    latestUpdate: {type: Date, default: Date.now},
    releaseNotes: String,
    dependencies: [{
      name: String,
      version: String
    }]
  }],
  latestVersion: {
    version: String,
    downloadUrl: String,
    latestUpdate:  {type: Date, default: Date.now},
    releaseNotes:  String,
    dependencies: [{
      name: String,
      version: String
    }]
  },
  meta: {
    downloadCount:  {type: Number, default: 0}
  }
});

var applicationsModel = mongoDB.model('applications', applicationSchema);

app.configure(function () {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
  app.use(app.router);
});

app.configure('development', function () {
  app.use(logErrors);
  app.use(clientErrorHandler);
  app.use(errorHandler);
});

app.configure('production', function () {
  app.use(logErrors);
  app.use(clientErrorHandler);
  app.use(errorHandler);
});

// Routes - Service
app.get('/', routes.index);

app.get('/upload', function (req, res) {
  res.render('upload', { title: 'Mediusflow Market' });
});

//api
app.get('/api/applications', function (req, res) {
  logWebRequest(req);
  applicationsModel.find({}, function (err, data) {
    if (err) {
      logHandler('ERROR', 'MongoDB', err);
      res.send(404);
    } else {
      res.json(data);
    }
  });
});

app.get('/api/applications/:application', function (req, res) {
  logWebRequest(req);
  applicationsModel.findOne({name: req.params.application.toLowerCase()}, function (err, data) {
    if (err) {
      logHandler('ERROR', 'MongoDB', err);
      return res.send(404);
    }
    if (data) {
      res.json(data);
    } else {
      logHandler('Warning', 'Express', 'Resources not available.');
      res.send(404);
    }
  });
});

app.get('/api/containers/:container/files/:file', function (req, res) {
  logWebRequest(req);
  var blobName = req.params.file.toLowerCase();
  var containerName = req.params.container.toLowerCase();
  if (containerName === "applications") {
    applicationsModel.findOne({ name: blobName.split("_")[0] }, function (err, data) {
      if (err) {
        logHandler('ERROR', 'MongoDB', err);
      } else {
        data.meta.downloadCount = data.meta.downloadCount + 1;
        data.save();
      }
    });
  }
  blobService.getBlobToStream(containerName, blobName, res, function (err) {
    if (err) {
      logHandler('ERROR', 'BlobStorage', err);
      res.send(404);
    }
  });
});

app.get('/api/applications/:application/versions/:version', function (req, res) {
  logWebRequest(req);
  console.log(req.query);
  console.log(req.query.download);
  applicationsModel.findOne({name: req.params.application.toLowerCase()}, function (err, results) {
    if (err) {
      logHandler('ERROR', 'MongoDB', err);
      res.send(404);
    } else {
      if (results) {
        var i = results.versions.length;
        var strRegexp = req.params.version.replace(/\./g, "\\.").replace(/\*/g, ".+");
        var regex = new RegExp(strRegexp);
        while (i--) {
          if (regex.test(results.versions[i].version)) {
            if (req.query.download === 'yes') {
              return res.redirect(results.versions[i].downloadUrl);
            }
            return res.json(results.versions[i]);
          }
        }
        logHandler('WARNING', 'Express', 'Version was not found.');
        res.send(404);
      } else {
        logHandler('WARNING', 'Express', 'Application was not found.');
        res.send(404);
      }
    }
  });
});


app.post('/api/applications', function (req, res) {
  logWebRequest(req);
  var parsedManifest;
  var applicationObject;
  var version;
  async.series([
    function (callback) {
      try {
        logHandler('INFO', 'Nodejs', 'Uploaded file:' + JSON.stringify(req.files));
        logHandler('INFO', 'Nodejs', 'Uploaded file: ' + req.files.applicationPackage.path);
      } catch (err) {
        logHandler('INFO', 'Nodejs', 'Catch block: ' + err);
        callback(err);
      } finally {
        logHandler('INFO', 'Nodejs', 'Finally block');
        callback();
      }
    },
    //Parse manifest file
    function (callback) {
      var zip = new admzip(req.files.applicationPackage.path);
      var parser = new xml2js.Parser();
      var manifestRaw = zip.readAsText("Manifest.xml");
      manifestRaw = manifestRaw.replace("\ufeff", "");
      parser.parseString(manifestRaw, function (err, data) {
        if (err) {
          logHandler('ERROR', 'Nodejs', 'Manifest could not be parsed. Error: ' + err.toString());
          callback(err.toString());
        } else {
          if (data) {
            parsedPackage = data.Package;
            console.log("---------");
            console.log(parsedPackage);
            console.log("---------");
            logHandler('INFO', 'Nodejs', 'Manifest file parsed: ' + manifestRaw);
            callback();
          } else {
            err = 'No data in parsed manifest file.';
            logHandler('ERROR', 'Nodejs', err);
            callback(err);
          }
        }
      });
    },
    //Find existing integration in registry or create new one
    function (callback) {
      applicationsModel.findOne({ name : parsedPackage.$.Name.toLowerCase() }, function (err, data) {
        if (err) {
          logHandler('ERROR', 'MongoDB', err);
          callback(err);
        } else {
          if (!data) {
            //Create new application
            applicationsModel.create({
              name : parsedPackage.$.Name.toLowerCase(),
              friendlyName : parsedPackage.$.Name.toLowerCase(),
              description : '',
              category : ''
            }, function (err, data) {
              if (err) {
                logHandler('ERROR', 'MongoDB', err);
                callback(err);
              } else {
                applicationObject = data;
                callback();
              }
            });
          } else {
            applicationObject = data;
            callback();
          }
        }
      });
    },
    //Add new version to registry 
    function (callback) {
      if (applicationObject) {
        version = {version: parsedPackage.$.Version, dependencies: [], downloadUrl: '', releaseNotes: ''};
        if (parsedPackage.Dependecies[0].Package) {
          parsedPackage.Dependecies[0].Package.forEach(function (item) {
            version.dependencies.push({name: item.$.Name.toLowerCase(), version: item.$.Version.toLowerCase()});
          });
        }
        version.downloadUrl = config.serverUrlBase + "/api/containers/applications/files/" + applicationObject.name.toLowerCase() + "_" +  version.version.toLowerCase() + ".zip";
        for (var i =0; i < applicationObject.versions.length; i++) {
          if (applicationObject.versions[i].version === version.version) {
            applicationObject.versions.splice(i,1);
            break;
          }
        }
        if (req.body.category) {
          applicationObject.category = req.body.category;  
        }
        if (req.body.description) {
          applicationObject.description = req.body.description;  
        }
        if (req.body.friendlyName) {
          applicationObject.friendlyName = req.body.friendlyName;  
        }
        if (req.body.releasenotes) {
          version.releaseNotes = req.body.releasenotes;  
        }
        applicationObject.versions.push(version);
        applicationObject.latestVersion = version;
        applicationObject.save();
        callback();
        } else {
          var err = 'Add new version to registry failed';
          logHandler('ERROR', 'Nodejs', err);
          callback(err);
        }  
      },
      //Upload package to blob storage
      function (callback) {
        var blobName = applicationObject.name.toLowerCase() + "_" +  version.version.toLowerCase() + ".zip";
        createBlockBlobFromFileModForLargeFiles (req.files.applicationPackage.path, blobName, "applications", function (err) {
          if (err) {
            logHandler('ERROR', 'BlobStorage', 'Could not upload to Blob Storage. Error: ' + err);
          } else {
            logHandler('INFO', 'BlobStorage', 'Blob uploaded: ' + blobName);     
          }
          fs.unlink(req.files.applicationPackage.path, function (err) {
            if (err) {
              logHandler('ERROR', 'BlobStorage', 'Temp file could NOT be deleted: ' + req.files.applicationPackage.path);
              callback();
            } else {
              logHandler('INFO', 'BlobStorage', 'Temp file deleted: ' + req.files.applicationPackage.path);
              callback();  
            }
          });
        });
      }
    ], function (err) {
      if (err) {
        return apiErrorHandler(err,req,res);
      }
      var responseObject = {
        response: 'Application successfully published!'
      };
      res.json(responseObject);    
    });
});

server.listen((process.env.PORT || 3000), function(){
  console.log("Express server listening");
});

function createBlockBlobFromFileModForLargeFiles (file, blobName, container, callback) {
  var size = fs.statSync(file).size;
  var chunkSize = Math.pow(1024,2) * 4;
  var chunks = Math.ceil(size / chunkSize);
  logHandler('INFO', 'BlobStorage', 'createBlockBlobFromFileModForLargeFiles: ' + size + ', ' + chunkSize + ', ' + chunks);
  async.timesSeries(chunks, function (n, next) {
    logHandler('INFO', 'BlobStorage', 'Chunk start: ' + n);
    var start = n * chunkSize;
    var end = start + chunkSize;// - 1;
    if (n === chunks-1) {
      end = start + (size%chunkSize);
    }
    var blockId = blobName + '--' + ("00000" + n).slice(-5);
    logHandler('INFO', 'BlobStorage', 'Chunk id: ' + n + ', ' + blockId);
    var stream = fs.createReadStream(file, {start: start, end: end});
    blobService.createBlobBlockFromStream(blockId, container, blobName, stream, end-start, function(err){
      logHandler('INFO', 'BlobStorage', 'Chunk done: ' + n + ', ' + err);
      if (err) {
        return next(err);
      }
      next(null, blockId);
    });
  }, function (err, blocks) {
    logHandler('INFO', 'BlobStorage', 'Blocks uploaded, waiting for commit.');
    if (err) {
      return errorHandler(err);
    }
    var blockList = {
      LatestBlocks: blocks
    };
    logHandler('INFO', 'BlobStorage', 'Block list:' + blockList);
    blobService.commitBlobBlocks(container, blobName, blockList, function (err) {
      logHandler('INFO', 'BlobStorage', 'Blocks commited: ' + err);
      callback(err);
    });
  });  
}