using {shubh.incidents as sch} from '../db/schema';

service IncidentService {
    @mcp: {
        name       : 'incidents',
        description: 'Cloud Foundry log & trace incidents with root cause analysis and remediation actions',
        resource   : true
    }
    @Capabilities : {
        Insertable : true,
        Updatable  : true,
        Deletable  : true
    }
    entity Incidents        as projection on sch.Incidents;

    @mcp: {
        name       : 'impactedServices',
        description: 'Microservices and application instances impacted by incidents',
        resource   : true
    }
    @Capabilities : {
        Insertable : true,
        Updatable  : true,
        Deletable  : true
    }
    entity ImpactedServices as projection on sch.ImpactedServices;

    @mcp: {
        name       : 'traceEvents',
        description: 'Cloud Foundry application logs, audit events, and trace execution history',
        resource   : true
    }
    @Capabilities : {
        Insertable : true,
        Updatable  : true,
        Deletable  : true
    }
    entity TraceEvents      as projection on sch.TraceEvents;

    @mcp: {
        name       : 'messages',
        description: 'Incident activity log messages and comments',
        resource   : true
    }
    @Capabilities : {
        Insertable : true,
        Updatable  : true,
        Deletable  : true
    }
    entity Messages         as projection on sch.Messages;
}

// Annotate entity wrapper tools for MCP AI agent CRUD operations
annotate IncidentService.Incidents with @mcp.wrap: {
    tools: true,
    modes: ['query', 'get', 'create', 'update', 'delete'],
    hint: 'Use to query, create, update, or delete Cloud Foundry incidents and remediation statements'
};

annotate IncidentService.ImpactedServices with @mcp.wrap: {
    tools: true,
    modes: ['query', 'get', 'create', 'update', 'delete'],
    hint: 'Use to manage impacted application instances and service bindings'
};

annotate IncidentService.TraceEvents with @mcp.wrap: {
    tools: true,
    modes: ['query', 'get', 'create', 'update', 'delete'],
    hint: 'Use to manage and query Cloud Foundry log and trace events'
};

annotate IncidentService.Messages with @mcp.wrap: {
    tools: true,
    modes: ['query', 'get', 'create', 'update', 'delete'],
    hint: 'Use to create, read, update, or delete incident log messages and resolution notes'
};

using from '../app/annotations';
