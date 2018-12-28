var RawCdr = require('dvp-mongomodels/model/Cdr').Cdr;
var config = require('config');

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