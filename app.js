/**
 * Module dependencies.
 */
var config = require('./config')
  , sys = require('sys')
  , express = require('express')
  , routes = require('./routes')
  , io = require('socket.io')
  , azure = require('azure')
  , fs = require('fs')
  , http = require('http')
  , admzip = require('adm-zip')
  , xml2js = require('xml2js')
  , mongoose = require('mongoose')
  , async = require('async')
  , inspect = require('eyes').inspector({maxLength: false});

// Configuration
var app = express();
server = http.createServer(app);
blobService = azure.createBlobService(config.azure_storage_username, config.azure_storage_key, config.azure_storage_URL_base).withFilter(new azure.ExponentialRetryPolicyFilter());

//Mongoose
mongoose.connect(config.mongodb_connectionString, function (err, res) {
  if (err) { 
  console.log ('ERROR connecting to: ' + config.mongodb_connectionString + '. ' + err);
  } else {
  console.log ('Succeeded connected to: ' + config.mongodb_connectionString);
  }
});

var Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

var applicationSchema = new Schema({
  name:         String,
  description:  String,
  imageUrl:    String,
  category:     String,
  keywords:     [String],
  versions: [{ 
    version:        String,
    downloadUrl:   String,
    latestUpdate:  {type: Date, default: Date.now},
    releaseNotes:  String, 
    dependencies: [{
      name: String,
      version: String
    }] 
  }],
  latestVersion: { 
    version:        String,
    downloadUrl:   String,
    latestUpdate:  {type: Date, default: Date.now},
    releaseNotes:  String, 
    dependencies: [{
      name: String,
      version: String
    }] 
  } ,
  meta: {
    downloads:  Number
  }
});

io = io.listen(app);

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.static(__dirname + '/public'));
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

//Mongoose
applications_model = mongoose.model('applications', applicationSchema);

// Routes - Service
app.get('/apps', function (req, res) {
  applications_model.find(
    {},
    function (err, results) {
      if (!err) {
        res.json(results);
      }
    });
});

app.post('/apps', function(req, res) {
    
  //Get application name / version from manifest file
    var zip = new admzip(req.files.app.path);
    console.log("Desc: ");
    console.log(req.body.description);
    console.log("Release notes: ");
    console.log(req.body.releasenotes);
  //Register new application
    async.series([
      //Parse manifest file
      function(callback) {
        var parser = new xml2js.Parser();
        parser.parseString(zip.readAsText("Manifest.xml"), function (err, res) {
          manifest = res;
          callback();
        });
      },
      //Find existing integration in registry or create new one
      function(callback) {
        applications_model.findOne({ name : manifest.Package.$["Name"] }, function (err, res) {
          if (err) return handleError(err);
          if (!res) {
            applications_model.create({
              name : manifest.Package.$["Name"],
              description : '',
              category : '',
            }, function(err, res) {
              if (err) return handleError(err);
              app = res;
              callback();
            });
          } else {
          app = res;
          callback(); 
          }
        });
      },

      //Add new version to registry 
      function(callback) {
        if (app) {
          version = new Object({version: manifest.Package.$["Version"], dependencies: [], downloadUrl: '', releaseNotes: ''});
          manifest.Package["Dependecies"][0]["Package"].forEach(function (item) {
            version.dependencies.push({name: item.$["Name"], version: item.$["Version"]});
          });
          version.downloadUrl = config.azure_storage_URL_applications + app.name + "_" +  version.version + ".zip";
          for (var i =0; i < app.versions.length; i++) {
            if (app.versions[i].version === version.version) {
              app.versions.splice(i,1);
              break;
            }
          }
          if (req.body.category) {
            app.category = req.body.category;  
          }
          if (req.body.description) {
            app.description = req.body.description;  
          }
          if (req.body.releasenotes) {
            version.releaseNotes = req.body.releasenotes;  
          }
          app.versions.push(version);
          app.latestVersion = version;
          app.save();
          callback(); 

        } else {
          //should never end up here..
          console.log("no app id");
          callback();
        }  
      },
      //Upload package to blob storage
      function(callback) {
        var blobName = app.name + "_" +  version.version + ".zip";
        blobService.createBlockBlobFromFile("applications"
          , blobName
          , req.files.app.path
          , function(error){
          if(!error){
            console.log("file has been uploaded!")
            callback();
          }
        });
      }
    ], function(err) {
      if (err) return handleError(err);
      res.send("Application registered!");
    });
});



//CLIENT

//Configuration
/*if (config.azureInstallation) {
  clientBlobService = azure.createBlobService(config.azureClientStorageUsername, config.azureClientStorageKey, config.azureClientUrlBase).withFilter(new azure.ExponentialRetryPolicyFilter());
}*/

// Routes - Client
app.get('/', routes.index);

app.get('/upload', function(req,res) {
  res.render('upload', { title: 'Mediusflow Market' });
})

//rest API - Client
app.post('/deployments/:deployment_id/tenants/:tenant_id/applications', function(req, res) {
  console.log('---------------');
  console.log('Posted object:');
  console.log(req.body);
  
  //Verify input parameters TBD

  //Add application to package repo
  async.series([

    function(callback) {
      async.each(req.body, 
        function (item, callback) {
          var application = item.application_id;
          var version = item.version;
          
          getApplicationObject(item.application_id, item.version, function(err, res) {
          
            console.log('---------------');
            console.log('Application: ' + item.application_id + ', version: ' + item.version);
            if (!err) {
              console.log("Download URL: " + res.downloadUrl);
              if (res.downloadUrl) {

                var filePath = config.tempLocalFilePath + item.application_id + "_" + res.version + ".zip";
                var unzipPath = config.packageRepositoryLocalFilePath + item.application_id + "_" + res.version;

                var request = http.get(res.downloadUrl, function(response) {
                  console.log('File is being downloaded...');
                  response.pipe(fs.createWriteStream(filePath));
                  response.on('end', function() {
                    console.log(filePath + ' is being unziped to ' + unzipPath);
                    var zip = new admzip(filePath);
                    var zipEntries = zip.getEntries(); // an array of ZipEntry records
                    zip.extractAllTo(unzipPath, /*overwrite*/true);
                    //TODO: Upload to azure package store
                    if (config.azureInstallation) {
                      console.log('Azure installation (files will be uploaded to Blob Storage');
                      walk(unzipPath, function (err, files) {
                        async.each(files, function (item, callback) {
                          console.log('File to upload: ');
                          console.log(item.toString().substring(config.packageRepositoryLocalFilePath.length));
                          
                          /*clientBlobService.createBlockBlobFromFile("packageRepository", 
                          item.toString().substring(config.packageRepositoryLocalFilePath.length), 
                          item.toString(), 
                          function (error) {
                            if(!error){
                              console.log("file has been uploaded!")
                            }
                          });*/
                          callback();
                        }, function(err){
                          RegisterApplicationInMainTenantManager(application, version, function () {
                            console.log('Running callback');
                            callback();  
                          });
                          
                          
                        });
                      }); 
                    }
                    else {
                      RegisterApplicationInMainTenantManager(application, version, function () {
                            console.log('Running callback');
                            callback();  
                          });
                    }
                  });
                });  
              } else {
                console.log("downloadUrl missing (set as error)");
                callback();
              }

            } else {
              console.log(err);
              callback();
            }
          }); 
        }, function(err){
        console.log("done");
        callback();
      });
    },

    function(callback) {
      console.log("update mtm etc.");

      //Add applications to tenant in main tenant manager
      var query = 'select * from tasks where completed = 0';

      /*sql.query(conn, select, function(err, items) {
        if(err)
            throw err;
        res.render('index', { title: 'My ToDo List ', tasks: items });
      });*/

      //Restart tenant
      callback();

    }], function(err) {
      console.log("Application registered!");
    }); 
});

app.put('/deployments/:deployment_id/tenants/:tenant_id/applications/:application_id/versions/:version', function(req, res) {
  console.log(req.params.deployment_id);
  console.log(req.params.tenant_id);
  console.log(req.params.application_id);
  console.log(req.params.version);
  //Verify input parameters TBD

  //Zip application package
  var folderPath = "C:\\Users\\Khalid\\Desktop\\test\\" + req.params.application_id + "_" + req.params.version;
  var zipPath = "C:\\Users\\Khalid\\Desktop\\test\\" + req.params.application_id + "_" + req.params.version + ".zip";
  var zip = new admzip();
  zip.addLocalFolder(folderPath);
  zip.writeZip(zipPath);
});


app.post('/deployments/:deployment_id/tenants/:tenant_id/unzip', function(req, res) {
  console.log(req.params.deployment_id);
  console.log(req.params.tenant_id);
  console.log(req.body.application_id);
  console.log(req.body.version);
  //Verify input parameters TBD

  //Add application to package repo
  var filePath = "C:\\Users\\Khalid\\Desktop\\test\\" + req.body.application_id + "_" + req.body.version + ".zip";
  var unzipPath = "C:\\Users\\Khalid\\Desktop\\test\\" + req.body.application_id + "_" + req.body.version;
  var fileURL = config.azure_storage_URL_applications + req.body.application_id + "_" + req.body.version + ".zip";
  console.log("Begin unzip");    
  var zip = new admzip(filePath);
  var zipEntries = zip.getEntries(); // an array of ZipEntry records
  zip.extractAllTo(unzipPath, /*overwrite*/true);
});
var port = process.env.PORT || 3000;
server.listen(port, function(){
  console.log("Express server listening");
});

// FUNCTION DEFINITION
RegisterApplicationInMainTenantManager = function (application, version, callback) {
  var query = 'if not exists (select * from [medius.tenant.entities].applications where name = \'' + application + '\' and version = \'' + version + '\') Begin insert into [medius.tenant.entities].applications (name,version) values (\'' + application +'\',\'' + version +'\') END';
  console.log(query);
  callback();
      /*sql.query(conn, query, function(err, items) {
        if(err)
            throw err;
        res.render('index', { title: 'My ToDo List ', tasks: items });
      });*/
}


getObjectFromArrayByPropertyName = function(collection, name){
    var len = collection.length;
    
    for(var i = 0; i<len; i++){
        var item = collection[i];

        if(item.name === name) return item;
    }
    return false;
};

getObjectFromArrayByPropertyVersion = function(collection, version){
    var len = collection.length;
    strRegexp = version.replace(/\./g , "\\.").replace(/\*/g , ".+");
    console.log(strRegexp);
    var regex = new RegExp(strRegexp);
    for(var i = 0; i<len; i++){
        var item = collection[i];
        console.log(item.version);
        if(regex.test(item.version)) return item;
    }
    return false;
};

getApplicationObject = function(application, version, callback) {
  var options = {
    host: 'localhost',
    port: 3000,
    path: '/apps',
    method: 'GET'
  };
  http.get(options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      var applications = JSON.parse(chunk);
      var objApplication = getObjectFromArrayByPropertyName(applications, application);
      if (objApplication) {
        callback(null, getObjectFromArrayByPropertyVersion(objApplication.versions, version));
      } else {
        callback("No application found!", null)
      }
    });
  });
};

//Other

walk = function(dir, callback) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return callback(err);
    var pending = list.length;
    if (!pending) return callback(null, results);
    list.forEach(function(file) {
      file = dir + '\\' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) callback(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) callback(null, results);
        }
      });
    });
  });
};
