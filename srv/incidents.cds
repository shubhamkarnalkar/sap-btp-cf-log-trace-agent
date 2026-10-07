using {shubh.incidents as sch} from '../db/schema';

service IncidentService {
    entity Incidents        as projection on sch.Incidents;
    entity ImpactedServices as projection on sch.ImpactedServices;
    entity TraceEvents      as projection on sch.TraceEvents;
    @Capabilities : {
        Insertable : true,
        Updatable  : true,
        Deletable  : true
    }
    entity Messages         as projection on sch.Messages;
}

using from '../app/annotations';
