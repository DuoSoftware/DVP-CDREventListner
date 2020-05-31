var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var dbModel = require('dvp-dbmodels');

var AddCDRRecord = function(cdrInfo, callback)
{
    try
    {
        cdrInfo
            .save()
            .then(function (rsp)
            {
                logger.info('[DVP-CDRProcessor.AddCDRRecord] PGSQL ADD CDR RECORD query success');
                callback(undefined, true);

            }).catch(function(err)
            {
                logger.error('[DVP-CDRProcessor.AddCDRRecord] PGSQL ADD CDR RECORD query failed', err);
                callback(err, false);
            })
    }
    catch(ex)
    {
        callback(ex, false);
    }
};

var GetSpecificLegByUuid = function(uuid, callback)
{
    try
    {
        dbModel.CallCDR.find({where :[{Uuid: uuid}]}).then(function(callLeg)
        {
            if(callLeg)
            {
                callback(null, callLeg);
            }
            else
            {
                callback(null, null);
            }

        });

    }
    catch(ex)
    {
        callback(ex, null);
    }
};

module.exports.AddCDRRecord = AddCDRRecord;
module.exports.GetSpecificLegByUuid = GetSpecificLegByUuid;