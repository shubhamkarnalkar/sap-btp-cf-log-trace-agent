using IncidentService as service from '../srv/incidents';

// ============================================================================
// Incidents Elements Label Annotations
// ============================================================================
annotate service.Incidents with {
    ID                   @title: 'Incident ID'           @Common.Label: 'Incident ID';
    applicationId        @title: 'Application ID'        @Common.Label: 'Application ID';
    status               @title: 'Status'                @Common.Label: 'Status'
                         @Common.ValueListWithFixedValues: true
                         @Common.ValueList: {
                             $Type          : 'Common.ValueListType',
                             Label          : 'Status',
                             CollectionPath : 'Statuses',
                             Parameters     : [
                                 {
                                     $Type             : 'Common.ValueListParameterInOut',
                                     LocalDataProperty : status,
                                     ValueListProperty : 'code',
                                 },
                                 {
                                     $Type             : 'Common.ValueListParameterDisplayOnly',
                                     ValueListProperty : 'name',
                                 }
                             ]
                         };
    errorCategory        @title: 'Error Category'        @Common.Label: 'Error Category';
    targetSpace          @title: 'Target Space'          @Common.Label: 'Target Space';
    createdAt            @title: 'Created At'            @Common.Label: 'Created At'  @UI.HiddenFilter: false;
    correlatedRequestId  @title: 'Request ID / GUID'     @Common.Label: 'Request ID / GUID';
    rootCauseStatement   @title: 'Root Cause Statement'  @Common.Label: 'Root Cause Statement';
    remediationAction    @title: 'Remediation Action'    @Common.Label: 'Remediation Action';
};

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
        ID,
        applicationId,
        status,
        errorCategory,
        targetSpace,
        createdAt
    ],
    UI.Identification                : [
        {
            $Type : 'UI.DataFieldForAction',
            Action: 'IncidentService.executeResolutionTask',
            Label : 'Execute Resolution Task (AI)',
        },
        {
            $Type : 'UI.DataFieldForAction',
            Action: 'IncidentService.suggestResolution',
            Label : 'Add Resolution Message',
        }
    ],
    UI.LineItem                      : [
        {
            $Type : 'UI.DataFieldForAction',
            Action: 'IncidentService.executeResolutionTask',
            Label : 'Execute Resolution Task (AI)',
        },
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
            Criticality : (status = 'Resolution added by Agent' or status = 'RESOLVED' ? 3 : (status = 'INVESTIGATING' ? 2 : 1)),
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
            Value: ID,
            Label: 'Incident ID',
        },
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

// ============================================================================
// Statuses UI & Value Help Annotations
// ============================================================================
annotate service.Statuses with {
    code        @title: 'Status Code'  @Common.Label: 'Status Code'  @Common.Text: name  @Common.TextArrangement: #TextFirst;
    name        @title: 'Status Name'  @Common.Label: 'Status Name';
    criticality @title: 'Criticality'  @Common.Label: 'Criticality';
};

annotate service.Statuses with @(
    UI.HeaderInfo     : {
        TypeName       : 'Status',
        TypeNamePlural : 'Statuses',
        Title          : {
            $Type : 'UI.DataField',
            Value : name,
        },
        Description    : {
            $Type : 'UI.DataField',
            Value : code,
        }
    },
    UI.Identification : [
        {
            $Type : 'UI.DataField',
            Value : code,
        },
        {
            $Type : 'UI.DataField',
            Value : name,
        }
    ],
    UI.LineItem       : [
        {
            $Type : 'UI.DataField',
            Value : code,
            Label : 'Status Code',
        },
        {
            $Type : 'UI.DataField',
            Value : name,
            Label : 'Status Name',
        },
        {
            $Type : 'UI.DataField',
            Value : criticality,
            Label : 'Criticality',
        }
    ]
);
