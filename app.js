var restify = require('restify');
var backendHandler = require('./DBBackendHandler.js');
var dbModel = require('dvp-dbmodels');
var config = require('config');
var uuidv1 = require('uuid/v1');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var amqpPublisher = require('./AMQPHandler.js').PublishToQueue;
var authorization = require('dvp-common/Authentication/Authorization.js');
var redisHandler = require('./RedisHandler.js');
var mongoDbOp = require('./MongoDBOperations.js');
var healthcheck = require('dvp-healthcheck/DBHealthChecker');
var mongomodels = require('dvp-mongomodels');

var hostIp = config.Host.Ip;
var hostPort = config.Host.Port;

var server = restify.createServer({
    name: 'DVP-CDREventListner'
});


server.use(restify.CORS());
server.use(restify.fullResponse());
server.pre(restify.pre.userAgentConnection());


restify.CORS.ALLOW_HEADERS.push('authorization');

server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

var hc = new healthcheck(server, {redis: redisHandler.client, pg: dbModel.SequelizeConn, mongo: mongomodels.connection});
hc.Initiate();

server.post('/DVP/API/:version/CDREventListner/ProcessCDR', function(req,res,next)
{
    var reqId = uuidv1();

    try
    {
        logger.info('[DVP-CDREventListner.ProcessCDR] - [%s] - FS CDR Request Received', reqId);
        var cdrObj = req.body;

        if(cdrObj)
        {
            var rawCDR = JSON.stringify(cdrObj);

            logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - CDR Request Params : %s', reqId, rawCDR);

            var varSec = cdrObj['variables'];
            var callFlowSec = cdrObj['callflow'];

            cdrObj.uuid = varSec['uuid'];

            mongoDbOp.addRawCDRRecord(cdrObj);

            if(callFlowSec && callFlowSec.length > 0)
            {

                var timesSec = callFlowSec[0]['times'];
                var callerProfileSec = callFlowSec[0]['caller_profile'];

                var uuid = varSec['uuid'];
                var callUuid = varSec['call_uuid'];
                var bridgeUuid = varSec['bridge_uuid'];
                var sipFromUser = callerProfileSec['caller_id_number'];
                var sipToUser = callerProfileSec['destination_number'];

                if(varSec['is_ivr_transfer'])
                {
                    sipToUser = decodeURIComponent(varSec['sip_to_user']);
                }

                var direction = varSec['direction'];
                var dvpCallDirection = varSec['DVP_CALL_DIRECTION'];

                var opCat = varSec['DVP_OPERATION_CAT'];
                var actionCat = varSec['DVP_ACTION_CAT'];
                var advOpAction = varSec['DVP_ADVANCED_OP_ACTION'];
                var campaignId = varSec['CampaignId'];
                var campaignName = varSec['CampaignName'];

                var isAgentAnswered = false;

                var ardsAddedTimeStamp = varSec['ards_added'];
                var queueLeftTimeStamp = varSec['ards_queue_left'];
                var ardsRoutedTimeStamp = varSec['ards_routed'];
                var ardsResourceName = varSec['ards_resource_name'];
                var ardsSipName = varSec['ARDS-SIP-Name'];
                var sipResource = null;

                var isQueued = false;

                if(ardsResourceName && dvpCallDirection === 'inbound')
                {
                    sipResource = ardsResourceName;
                }
                else if(ardsSipName && dvpCallDirection === 'inbound')
                {
                    sipResource = ardsSipName;
                }

                if(actionCat === 'DIALER')
                {
                    if(opCat === 'AGENT')
                    {
                        if(varSec['sip_to_user'])
                        {
                            sipFromUser = varSec['sip_to_user'];
                            sipResource = varSec['sip_to_user'];
                        }
                        else
                        {
                            sipFromUser = varSec['dialed_user'];
                            sipResource = varSec['dialed_user'];
                        }

                        if(varSec['sip_from_user'])
                        {
                            sipToUser = varSec['sip_from_user'];
                        }
                        else
                        {
                            sipToUser = varSec['origination_caller_id_number'];
                        }
                    }
                    else if((advOpAction === 'BLAST' || advOpAction === 'DIRECT' || advOpAction === 'IVRCALLBACK') && opCat === 'CUSTOMER')
                    {
                        //NEED TO IMPLEMENT
                        sipFromUser = varSec['dialer_from_number'];
                        sipToUser = varSec['dialer_to_number'];
                    }
                }
                else if(direction === 'inbound' && dvpCallDirection === 'inbound')
                {
                    //get sip_from_user as from user for all inbound direction calls
                    sipFromUser = varSec['sip_from_user'];
                }

                var hangupCause = varSec['hangup_cause'];
                var switchName = cdrObj['switchname'];
                var callerContext = callerProfileSec['context'];
                var appId = varSec['dvp_app_id'];
                var companyId = varSec['companyid'];
                var tenantId = varSec['tenantid'];
                var bUnit = varSec['business_unit'];
                
                if(varSec['queue_business_unit'])
                {
                    bUnit = varSec['queue_business_unit'];
                }

                var currentApp = varSec['current_application'];
                var confName = varSec['DVP_CONFERENCE_NAME'];

                var sipHangupDisposition = varSec['sip_hangup_disposition'];
                var memberuuid = varSec['memberuuid'];
                var conferenceUuid = varSec['conference_uuid'];
                var originatedLegs = varSec['originated_legs'];
                var startEpoch = varSec['start_epoch'];
                var answerDate = undefined;
                var createdDate = undefined;
                var bridgeDate = undefined;
                var hangupDate = undefined;

                if(!sipToUser || (actionCat === 'FORWARDING' && direction === 'inbound'))
                {
                    sipToUser = decodeURIComponent(varSec['sip_to_user']);
                }

                if(!sipFromUser)
                {
                    sipFromUser = decodeURIComponent(varSec['origination_caller_id_number']);
                }

                if(!sipToUser)
                {
                    sipToUser = decodeURIComponent(varSec['dialed_user']);
                }

                if(conferenceUuid)
                {
                    callUuid = conferenceUuid;
                }

                sipFromUser = decodeURIComponent(sipFromUser);


                var answeredTimeStamp = timesSec['answered_time'];
                if(answeredTimeStamp)
                {
                    var ansTStamp = parseInt(answeredTimeStamp)/1000;
                    answerDate = new Date(ansTStamp);
                }

                var createdTimeStamp = timesSec['created_time'];
                if(createdTimeStamp)
                {
                    var createdTStamp = parseInt(createdTimeStamp)/1000;
                    createdDate = new Date(createdTStamp);
                }
                else
                {
                    if(startEpoch)
                    {
                        createdDate = new Date(startEpoch);
                    }
                }

                var bridgedTimeStamp = timesSec['bridged_time'];
                if(bridgedTimeStamp)
                {
                    var bridgedTStamp = parseInt(bridgedTimeStamp)/1000;
                    bridgeDate = new Date(bridgedTStamp);
                }

                var hangupTimeStamp = timesSec['hangup_time'];
                if(hangupTimeStamp)
                {
                    var hangupTStamp = parseInt(hangupTimeStamp)/1000;
                    hangupDate = new Date(hangupTStamp);
                }

                if(ardsAddedTimeStamp)
                {
                    isQueued = true;
                }

                var queueTime = 0;

                if(ardsAddedTimeStamp && queueLeftTimeStamp)
                {
                    var ardsAddedTimeSec = parseInt(ardsAddedTimeStamp);
                    var queueLeftTimeSec = parseInt(queueLeftTimeStamp);

                    queueTime = queueLeftTimeSec - ardsAddedTimeSec;
                }

                if(ardsRoutedTimeStamp)
                {
                    isAgentAnswered = true;
                }

                if(!appId)
                {
                    appId = '-1';
                }

                if(!companyId)
                {
                    companyId = '-1';
                }

                if(!tenantId)
                {
                    tenantId = '-1';
                }

                if(!bUnit)
                {
                    bUnit = 'default';
                }

                var ardsPriority = varSec['ards_priority'];

                var agentSkill = '';

                if(varSec['ards_skill_display'])
                {
                    agentSkill = decodeURIComponent(varSec['ards_skill_display']);
                }

                var duration = varSec['duration'] ? parseInt(varSec['duration']) : 0;
                var billSec = varSec['billsec'] ? parseInt(varSec['billsec']) : 0;
                var holdSec = varSec['hold_accum_seconds'] ? parseInt(varSec['hold_accum_seconds']) : 0;
                var progressSec = varSec['progresssec'] ? parseInt(varSec['progresssec']) : 0;
                var answerSec = varSec['answersec'] ? parseInt(varSec['answersec']) : 0;
                var waitSec = varSec['waitsec'] ? parseInt(varSec['waitsec']) : 0;
                var progressMediaSec = varSec['progress_mediasec'] ? parseInt(varSec['progress_mediasec']) : 0;
                var flowBillSec = varSec['flow_billsec'] ? parseInt(varSec['flow_billsec']) : 0;

                var isAnswered = false;

                if(answerDate > new Date('1970-01-01'))
                {
                    isAnswered = true;
                }

                var cdr = {
                    Uuid: uuid,
                    CallUuid: callUuid,
                    MemberUuid: memberuuid,
                    BridgeUuid: bridgeUuid,
                    SipFromUser: sipFromUser,
                    SipToUser: sipToUser,
                    HangupCause: hangupCause,
                    Direction: direction,
                    SwitchName: switchName,
                    CallerContext: callerContext,
                    IsAnswered: isAnswered,
                    CreatedTime: createdDate,
                    AnsweredTime: answerDate,
                    BridgedTime: bridgeDate,
                    HangupTime: hangupDate,
                    Duration: duration,
                    BillSec: billSec,
                    HoldSec: holdSec,
                    ProgressSec: progressSec,
                    QueueSec: queueTime,
                    AnswerSec: answerSec,
                    WaitSec: waitSec,
                    ProgressMediaSec: progressMediaSec,
                    FlowBillSec: flowBillSec,
                    ObjClass: 'CDR',
                    ObjType: opCat,
                    ObjCategory: 'DEFAULT',
                    CompanyId: companyId,
                    TenantId: tenantId,
                    AppId: appId,
                    AgentSkill: agentSkill,
                    OriginatedLegs: originatedLegs,
                    DVPCallDirection: dvpCallDirection,
                    HangupDisposition:sipHangupDisposition,
                    AgentAnswered: isAgentAnswered,
                    IsQueued: isQueued,
                    SipResource: sipResource,
                    CampaignId: campaignId,
                    CampaignName: campaignName,
                    BusinessUnit: bUnit,
                    QueuePriority: ardsPriority
                };



                if(actionCat === 'CONFERENCE')
                {
                    cdr.ExtraData = confName;
                }

                if(actionCat)
                {
                    cdr.ObjCategory = actionCat;
                }

                if(currentApp === 'voicemail')
                {
                    cdr.ObjCategory = 'VOICEMAIL';
                }
                else if(advOpAction === 'pickup')
                {
                    cdr.ObjCategory = 'PICKUP';
                }

                if(advOpAction === 'INTERCEPT')
                {
                    cdr.ObjCategory = 'INTERCEPT';
                }

                if(actionCat === 'DIALER' && advOpAction)
                {
                    cdr.ObjType = advOpAction;
                }

                if(dvpCallDirection === 'inbound' && callFlowSec[callFlowSec.length - 1].times)
                {
                    var callFlowTransferTime = callFlowSec[callFlowSec.length - 1].times.transfer_time;
                    var callFlowBridgeTime = callFlowSec[callFlowSec.length - 1].times.bridged_time;
                    //var callFlowAnswerTime = callFlowSec[callFlowSec.length - 1].times.answered_time;
                    var callFlowCreatedTime = callFlowSec[callFlowSec.length - 1].times.created_time;

                    if(callFlowTransferTime > 0 && callFlowCreatedTime > 0)
                    {
                        cdr.TimeAfterInitialBridge = Math.round((callFlowTransferTime - callFlowCreatedTime)/1000000);
                    }
                    else if(callFlowBridgeTime > 0 && callFlowCreatedTime > 0)
                    {
                        cdr.TimeAfterInitialBridge = Math.round((callFlowBridgeTime - callFlowCreatedTime)/1000000);
                    }
                    else
                    {
                        cdr.TimeAfterInitialBridge = 0;
                    }

                }


                var cdrSave = dbModel.CallCDR.build(cdr);


                backendHandler.AddCDRRecord(cdrSave, function(err, result)
                {
                    //Add to Queue
                    var arr = ['HTTAPI', 'SOCKET', 'REJECTED', 'FAX_INBOUND'];

                    if(cdr.Direction === 'inbound' && cdr.ObjCategory !== 'CONFERENCE' && (cdr.OriginatedLegs !== null ||
                            (cdr.OriginatedLegs === null && (arr.indexOf(cdr.ObjType) > -1 || cdr.ObjCategory === 'DND' || cdr.ObjCategory === 'OUTBOUND_DENIED'))))
                    {
                        //add to queue
                        cdr.TryCount = 0;

                        logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - ================== NEW A LEG PUBLISH TO QUEUE - UUID : [%s] ==================', reqId, cdr.Uuid);

                        amqpPublisher('CDRQUEUE', cdr);
                    }
                    else if(cdr.Direction === 'outbound' && varSec['DVP_ACTION_CAT'] === 'DIALER' && varSec['CALL_LEG_TYPE'] === 'CUSTOMER')
                    {
                        cdr.TryCount = 0;

                        logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - ================== NEW DIALER A LEG PUBLISH TO QUEUE - UUID : [%s] ==================', reqId, cdr.Uuid);

                        amqpPublisher('CDRQUEUE', cdr);
                    }
                    else
                    {
                        //Check Redis

                        redisHandler.GetObject('UUID_' + cdr.Uuid, function(error, val1)
                        {
                            if(val1)
                            {
                                backendHandler.GetSpecificLegByUuid(val1, function(error, callLeg1)
                                {
                                    if(callLeg1)
                                    {
                                        callLeg1.TryCount = 0;
                                        logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - ================== B LEG FOUND PUBLISH QUEUE VIA ORIGINATED LEG - UUID : [%s] ==================', reqId, callLeg1.Uuid);
                                        amqpPublisher('CDRQUEUE', callLeg1);
                                    }
                                })
                            }
                            else
                            {
                                redisHandler.GetObject('CALL_UUID_' + cdr.CallUuid, function(error, val2)
                                {
                                    if(val2)
                                    {
                                        backendHandler.GetSpecificLegByUuid(val2, function(error, callLeg2)
                                        {
                                            if(callLeg2)
                                            {
                                                callLeg2.TryCount = 0;
                                                logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - ================== B LEG FOUND PUBLISH QUEUE VIA CALL_UUID - UUID : [%s] ==================', reqId, callLeg2.Uuid);
                                                amqpPublisher('CDRQUEUE', callLeg2);
                                            }
                                        })
                                    }
                                    else
                                    {
                                        redisHandler.GetObject('CALL_UUID_' + cdr.MemberUuid, function(error, val3)
                                        {
                                            if(val3)
                                            {
                                                backendHandler.GetSpecificLegByUuid(val3, function(error, callLeg3)
                                                {
                                                    if(callLeg3)
                                                    {
                                                        callLeg3.TryCount = 0;
                                                        logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - ================== B LEG FOUND PUBLISH QUEUE VIA MEMBER_UUID - UUID : [%s] ==================', reqId, callLeg3.Uuid);
                                                        amqpPublisher('CDRQUEUE', callLeg3);
                                                    }
                                                })
                                            }

                                        });
                                    }

                                });
                            }
                        })
                    }

                    if(err)
                    {
                        logger.error('[DVP-CDREventListner.ProcessCDR] - [%s] - Exception occurred on method AddCDRRecord', reqId, err);
                        res.end('{}');
                    }
                    else
                    {
                        logger.debug('[DVP-CDREventListner.ProcessCDR] - [%s] - CDR Record saved successfully - Result : %s', reqId, result);
                        res.end('{}');
                    }
                });
            }
            else
            {
                logger.error('[DVP-CDREventListner.ProcessCDR] - [%s] - CDR Record Error - Call Flow Section Not Found - Result : %s', reqId);
                res.end('{}');
            }
        }
        else
        {
            logger.error('[DVP-CDREventListner.ProcessCDR] - [%s] - CDR Record Error - Request Body Not Found - Result : %s', reqId);
            res.end('{}');
        }



        //Read App details and push it to the common app event processor

    }
    catch(ex)
    {
        logger.error('[DVP-CDREventListner.ProcessCDR] - [%s] - Exception occurred', reqId, ex);
        res.end("{}");
    }

    return next();
});

server.post('/DVP/API/:version/CDREventListner/TestMethod', function(req,res,next){

    console.log("====================TEST METHOD=====================");

    console.log(req.body);

    res.end("{}");

});

server.listen(hostPort, hostIp, function () {
    console.log('%s listening at %s', server.name, server.url);
});


