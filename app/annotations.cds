using IncidentService as service from '../srv/incidents';

// ============================================================================
// Incidents UI Annotations
// ============================================================================
annotate service.Incidents with @(
    UI.HeaderInfo                    : {
        TypeName      : 'Incident',
        TypeNamePlural: 'Incidents',
        Title         : {
            $Type: 'UI.DataField',
            Value: correlatedRequestId,
        },
        Description   : {
            $Type: 'UI.DataField',
            Value: rootCauseStatement,
        }
    },
    UI.SelectionFields               : [
        applicationId,
        status,
        errorCategory,
        targetSpace,
        createdAt
    ],
    UI.LineItem                      : [
        {
            $Type: 'UI.DataField',
            Value: applicationId,
            Label: 'Application ID',
        },
        {
            $Type: 'UI.DataField',
            Value: correlatedRequestId,
            Label: 'Request ID / GUID',
        },
        {
            $Type       : 'UI.DataField',
            Value       : status,
            Label       : 'Status',
            Criticality : (status = 'OPEN' ? 3 : (status = 'INVESTIGATING' ? 2 : 1)),
        },
        {
            $Type: 'UI.DataField',
            Value: errorCategory,
            Label: 'Error Category',
        },
        {
            $Type: 'UI.DataField',
            Value: targetSpace,
            Label: 'Target Space',
        },
        {
            $Type: 'UI.DataField',
            Value: rootCauseStatement,
            Label: 'Root Cause Statement',
        },
        {
            $Type: 'UI.DataField',
            Value: createdAt,
            Label: 'Created At',
        }
    ],
    UI.Facets                        : [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'GeneralInformationFacet',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInformation',
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ImpactedServicesFacet',
            Label : 'Impacted Services',
            Target: 'impactedServices/@UI.LineItem',
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'TraceEventsFacet',
            Label : 'Trace & Audit Events',
            Target: 'traces/@UI.LineItem',
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'MessagesFacet',
            Label : 'Discussions',
            Target: 'messages/@UI.LineItem',
        }
    ],
    UI.FieldGroup #GeneralInformation: {Data: [
        {
            $Type: 'UI.DataField',
            Value: applicationId,
            Label: 'Application ID',
        },
        {
            $Type: 'UI.DataField',
            Value: correlatedRequestId,
            Label: 'Correlated Request ID',
        },
        {
            $Type: 'UI.DataField',
            Value: status,
            Label: 'Status',
        },
        {
            $Type: 'UI.DataField',
            Value: errorCategory,
            Label: 'Error Category',
        },
        {
            $Type: 'UI.DataField',
            Value: targetSpace,
            Label: 'Target Space',
        },
        {
            $Type: 'UI.DataField',
            Value: rootCauseStatement,
            Label: 'Root Cause Statement',
        },
        {
            $Type: 'UI.DataField',
            Value: remediationAction,
            Label: 'Remediation Action',
        },
        {
            $Type: 'UI.DataField',
            Value: createdAt,
            Label: 'Created At',
        },
        {
            $Type: 'UI.DataField',
            Value: createdBy,
            Label: 'Created By',
        },
        {
            $Type: 'UI.DataField',
            Value: modifiedAt,
            Label: 'Modified At',
        },
        {
            $Type: 'UI.DataField',
            Value: modifiedBy,
            Label: 'Modified By',
        }
    ]}
);

// ============================================================================
// ImpactedServices UI Annotations
// ============================================================================
annotate service.ImpactedServices with @(
    UI.HeaderInfo                : {
        TypeName      : 'Impacted Service',
        TypeNamePlural: 'Impacted Services',
        Title         : {
            $Type: 'UI.DataField',
            Value: serviceName,
        }
    },
    UI.LineItem                  : [
        {
            $Type: 'UI.DataField',
            Value: serviceName,
            Label: 'Service Name',
        },
        {
            $Type: 'UI.DataField',
            Value: instanceId,
            Label: 'Instance ID / GUID',
        }
    ],
    UI.Facets                    : [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'ImpactedServiceDetailsFacet',
        Label : 'Service Details',
        Target: '@UI.FieldGroup#ServiceDetails',
    }],
    UI.FieldGroup #ServiceDetails: {Data: [
        {
            $Type: 'UI.DataField',
            Value: serviceName,
            Label: 'Service Name',
        },
        {
            $Type: 'UI.DataField',
            Value: instanceId,
            Label: 'Instance ID / GUID',
        }
    ]}
);

// ============================================================================
// TraceEvents UI Annotations
// ============================================================================
annotate service.TraceEvents with @(
    UI.HeaderInfo                   : {
        TypeName      : 'Trace Event',
        TypeNamePlural: 'Trace Events',
        Title         : {
            $Type: 'UI.DataField',
            Value: serviceName,
        },
        Description   : {
            $Type: 'UI.DataField',
            Value: message,
        }
    },
    UI.LineItem                     : [
        {
            $Type: 'UI.DataField',
            Value: timestamp,
            Label: 'Timestamp',
        },
        {
            $Type: 'UI.DataField',
            Value: component,
            Label: 'Component',
        },
        {
            $Type: 'UI.DataField',
            Value: serviceName,
            Label: 'Service Name',
        },
        {
            $Type       : 'UI.DataField',
            Value       : logLevel,
            Label       : 'Log Level',
            Criticality : (logLevel = 'ERROR' ? 1 : (logLevel = 'WARN' ? 2 : 3)),
        },
        {
            $Type: 'UI.DataField',
            Value: statusCode,
            Label: 'Status Code',
        },
        {
            $Type: 'UI.DataField',
            Value: message,
            Label: 'Trace Message',
        }
    ],
    UI.Facets                       : [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'TraceEventDetailsFacet',
        Label : 'Trace Event Details',
        Target: '@UI.FieldGroup#TraceEventDetails',
    }],
    UI.FieldGroup #TraceEventDetails: {Data: [
        {
            $Type: 'UI.DataField',
            Value: timestamp,
            Label: 'Timestamp',
        },
        {
            $Type: 'UI.DataField',
            Value: component,
            Label: 'Component',
        },
        {
            $Type: 'UI.DataField',
            Value: serviceName,
            Label: 'Service Name',
        },
        {
            $Type: 'UI.DataField',
            Value: statusCode,
            Label: 'Status Code',
        },
        {
            $Type: 'UI.DataField',
            Value: logLevel,
            Label: 'Log Level',
        },
        {
            $Type: 'UI.DataField',
            Value: message,
            Label: 'Trace Message',
        }
    ]}
);

// ============================================================================
// Messages UI Annotations
// ============================================================================
annotate service.Messages with @(
    Capabilities                 : {
        Insertable: true,
        Updatable : true,
        Deletable : true
    },
    UI.HeaderInfo                : {
        TypeName      : 'Discussion',
        TypeNamePlural: 'Discussions',
        Title         : {
            $Type: 'UI.DataField',
            Value: text,
        }
    },
    UI.LineItem                  : [
        {
            $Type: 'UI.DataField',
            Value: text,
            Label: 'Message Text',
        },
        {
            $Type: 'UI.DataField',
            Value: createdAt,
            Label: 'Created At',
        },
        {
            $Type: 'UI.DataField',
            Value: createdBy,
            Label: 'Created By',
        }
    ],
    UI.Facets                    : [{
        $Type : 'UI.ReferenceFacet',
        ID    : 'MessageDetailsFacet',
        Label : 'Message Details',
        Target: '@UI.FieldGroup#MessageDetails',
    }],
    UI.FieldGroup #MessageDetails: {Data: [
        {
            $Type: 'UI.DataField',
            Value: text,
            Label: 'Message Text',
        },
        {
            $Type: 'UI.DataField',
            Value: createdAt,
            Label: 'Created At',
        },
        {
            $Type: 'UI.DataField',
            Value: createdBy,
            Label: 'Created By',
        }
    ]}
);
