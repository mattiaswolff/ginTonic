var config = {}

config.mongodb_connectionString = (process.env.CUSTOMCONNSTR_MONGOLAB_URI || 'mongodb://mattiaswolff:rab1bit@ds037647.mongolab.com:37647/gintonic');

config.azure_storage_username = 'mf11mediusflowmarket';
config.azure_storage_key = 'QjWB225ICZBD7E2Tzxu/XNP+TV4LbGbcjkOTseTBt/vCzkfxo2wGHAAEdrA0DwNXZOEIbvwkVBd7DtkC+kA1SA==';
config.azure_storage_URL_base = 'mf11mediusflowmarket.blob.core.windows.net';
config.azure_storage_URL_applications ='http://mf11mediusflowmarket.blob.core.windows.net/applications/';

config.packageRepositoryLocalFilePath = (process.env.CUSTOMCONNSTR_MONGOLAB_URI || 'C:\\Users\\Khalid\\Desktop\\test\\')
config.tempLocalFilePath = (process.env.CUSTOMCONNSTR_MONGOLAB_URI || 'C:\\Users\\Khalid\\Desktop\\test\\')  

//cloud or on premise.
config.azureInstallation = true;

// TODO: Function to set these values should be set by deployment / tenan
config.azureClientStorageUsername = 'mf11saas01storage01';
config.azureClientStorageKey = '--';
config.azureClientUrlBase = 'mf11saas01storage01.blob.core.windows.net'

config.sqldb_connectionString_maintenantmanager = 'mf11saas01';
config.sqldb_connectionString_tenant = 'mf11saas01';

//URLs
config.serverUrlBase = 'http://mf11market.azurewebsites.net'
config.clientUrlBase = 'http://localhost:3000'

module.exports = config;