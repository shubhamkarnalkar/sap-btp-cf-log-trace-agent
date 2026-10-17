using {shubh.logs_trace_agent as sch} from '../db/schema';

service Logservice {
    @mcp         : {
        name       : 'logs',
        description: 'Cloud Foundry log & trace Logs with root cause analysis and remediation actions',
        resource   : true
    }
    @Capabilities: {
        Insertable: true,
        Updatable : true,
        Deletable : true
    }
    entity Logs             as projection on sch.Logs
        actions {
            @mcp               : {
                name       : 'executeResolutionTask',
                description: 'Analyzes Cloud Foundry incident error and warning telemetry using the skill catalog, generates prescriptive remediation steps, and appends resolution message to discussions',
                tool       : true
            }
            @Common.SideEffects: {
                TargetEntities  : [
                    messages,
                    $self
                ],
                TargetProperties: [
                    'remediationAction',
                    'status'
                ]
            }
            action executeResolutionTask(
                                         @title: 'Prompt / Resolution Intent (Optional)'
                                         prompt: String) returns Logs;

            @mcp               : {
                name       : 'suggestResolution',
                description: 'Alias for executeResolutionTask - suggests and adds resolution message to incident discussions',
                tool       : true
            }
            @Common.SideEffects: {
                TargetEntities  : [
                    messages,
                    $self
                ],
                TargetProperties: [
                    'remediationAction',
                    'status'
                ]
            }
            action suggestResolution(
                                     @title: 'Prompt / Resolution Intent (Optional)'
                                     prompt: String)     returns Logs;
        };


    @mcp: {
        name       : 'executeResolutionTaskForIncident',
        description: 'Diagnoses Cloud Foundry error and warning telemetry for a specified incident ID, generates prescriptive resolution playbook from skills, and appends it to messages composition',
        tool       : true
    }
    action executeResolutionTaskForIncident(
                                            @title: 'Incident / Log UUID'
                                            incident_ID: UUID not null,
                                            @title: 'Prompt / Resolution Intent (Optional)'
                                            prompt: String) returns Logs;

    @mcp: {
        name       : 'suggestResolutionForIncident',
        description: 'Alias for executeResolutionTaskForIncident',
        tool       : true
    }
    action suggestResolutionForIncident(
                                        @title: 'Incident / Log UUID'
                                        incident_ID: UUID not null,
                                        @title: 'Prompt / Resolution Intent (Optional)'
                                        prompt: String)     returns Logs;


    @mcp         : {
        name       : 'impactedServices',
        description: 'Microservices and application instances impacted by Logs',
        resource   : true
    }
    @Capabilities: {
        Insertable: true,
        Updatable : true,
        Deletable : true
    }
    entity ImpactedServices as projection on sch.ImpactedServices;

    @mcp         : {
        name       : 'traceEvents',
        description: 'Cloud Foundry application logs, audit events, and trace execution history',
        resource   : true
    }
    @Capabilities: {
        Insertable: true,
        Updatable : true,
        Deletable : true
    }
    entity TraceEvents      as projection on sch.TraceEvents;

    @mcp         : {
        name       : 'messages',
        description: 'Incident activity log messages and comments',
        resource   : true
    }
    @Capabilities: {
        Insertable: true,
        Updatable : true,
        Deletable : true
    }
    entity Messages         as projection on sch.Messages;

    @readonly
    @mcp: {
        name       : 'statuses',
        description: 'Incident lifecycle status codes, descriptions, and criticalities',
        resource   : true
    }
    entity Statuses         as projection on sch.Statuses;
}

// Annotate entity wrapper tools for MCP AI agent CRUD operations
annotate Logservice.Logs with @mcp.wrap: {
    tools: true,
    modes: [
        'query',
        'get',
        'create',
        'update',
        'delete'
    ],
    hint : 'Use to query, create, update, or delete Cloud Foundry logs, Logs, and remediation statements'
};


annotate Logservice.ImpactedServices with @mcp.wrap: {
    tools: true,
    modes: [
        'query',
        'get',
        'create',
        'update',
        'delete'
    ],
    hint : 'Use to manage impacted application instances and service bindings'
};

annotate Logservice.TraceEvents with @mcp.wrap: {
    tools: true,
    modes: [
        'query',
        'get',
        'create',
        'update',
        'delete'
    ],
    hint : 'Use to manage and query Cloud Foundry log and trace events'
};

annotate Logservice.Messages with @mcp.wrap: {
    tools: true,
    modes: [
        'query',
        'get',
        'create',
        'update',
        'delete'
    ],
    hint : 'Use to create, read, update, or delete incident log messages and resolution notes'
};

annotate Logservice.Statuses with @mcp.wrap: {
    tools: true,
    modes: [
        'query',
        'get'
    ],
    hint : 'Use to query available incident status codes and descriptions'
};

using from '../app/annotations';
