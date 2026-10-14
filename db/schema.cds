namespace shubh.incidents;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity Incidents : cuid, managed {
    applicationId       : String(100);
    targetSpace         : String(100);
    correlatedRequestId : String(100);
    status              : String(50) default 'OPEN';
    errorCategory       : String(50);
    rootCauseStatement  : LargeString;
    remediationAction   : LargeString;
    impactedServices    : Composition of many ImpactedServices
                              on impactedServices.incident = $self;
    traces              : Composition of many TraceEvents
                              on traces.incident = $self;
    messages            : Composition of many Messages
                              on messages.incident = $self;
}

entity ImpactedServices : cuid {
    incident    : Association to Incidents;
    serviceName : String(100);
    instanceId  : String(50);
}

entity TraceEvents : cuid {
    incident    : Association to Incidents;
    timestamp   : Timestamp;
    component   : String(50); // RTR, CELL, APP
    serviceName : String(100);
    statusCode  : Integer;
    logLevel    : String(10);
    message     : LargeString;
}

entity Messages : cuid, managed {
    incident : Association to Incidents;
    text     : LargeString;
}
