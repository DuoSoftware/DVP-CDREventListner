var mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
var RawCdr = require('dvp-mongomodels/model/Cdr').Cdr;
var config = require('config');
var util = require('util');

var mongoip = config.Mongo.ip;
var mongoport = config.Mongo.port;
var mongodb = config.Mongo.dbname;
var mongouser = config.Mongo.user;
var mongopass = config.Mongo.password;
var mongoreplicaset = config.Mongo.replicaset;

var connectionstring = '';
mongoip = mongoip.split(',');

if(util.isArray(mongoip)){
    if(mongoip.length > 1){

        mongoip.forEach(function(item){
            connectionstring += util.format('%s:%d,', item, mongoport)
        });

        connectionstring = connectionstring.substring(0, connectionstring.length - 1);
        connectionstring = util.format('mongodb://%s:%s@%s/%s', mongouser, mongopass, connectionstring, mongodb);

        if(mongoreplicaset){
            connectionstring = util.format('%s?replicaSet=%s', connectionstring, mongoreplicaset) ;
            console.log("connectionstring ...   " + connectionstring);
        }
    }
    else
    {
        connectionstring = util.format('mongodb://%s:%s@%s:%d/%s', mongouser, mongopass, mongoip[0], mongoport, mongodb);
    }
}else {

    connectionstring = util.format('mongodb://%s:%s@%s:%d/%s', mongouser, mongopass, mongoip, mongoport, mongodb);

}
console.log("connectionstring ...   " + connectionstring);

mongoose.connection.on('error', function (err) {
    throw new Error(err);
});

mongoose.connection.on('disconnected', function() {
    throw new Error('Could not connect to database');
});

mongoose.connection.once('open', function() {
    console.log("Connected to db");
});

mongoose.connect(connectionstring);

var addRawCDRRecord = function(obj)
{
    if(config.SaveRawCDRMongo === 'true' || config.SaveRawCDRMongo === true)
    {
        var cdr = RawCdr(obj);

        cdr.save(function (err, obj)
        {
            if (err)
            {
                console.log(JSON.stringify(err));
            }
        });
    }

};

module.exports.addRawCDRRecord = addRawCDRRecord;