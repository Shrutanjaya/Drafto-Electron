
import type { DraftoProject, Annexure } from "@/lib/schema";
import { standardIaList } from "@/lib/ia-list";

export const getIaList = (projectData: DraftoProject) => {
    const ias: {prefix: string, title: string, id: string}[] = [];
    const year = new Date().getFullYear();
    const iaPrefix = projectData.caseType === 'Civil' ? `IA ____/${year}` : `Crl. MP ___/${year}`;
    
    const allAnnexures: Annexure[] = (projectData.listOfDates || []).flatMap(lod => lod.annexures || []);
    
    // Additional Documents IA comes first for P-annexure continuity
    if (projectData.standardIas.additionalDocuments) {
        const title = standardIaList.find(i => i.id === 'additionalDocuments')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'additionalDocuments' });
    }
    if (projectData.standardIas.condonationOfDelay.active) {
        const delayDays = projectData.standardIas.condonationOfDelay.delayDays > 0 ? projectData.standardIas.condonationOfDelay.delayDays : "__";
        const title = `Application for condonation of delay of ${delayDays} days in filing the SLP`;
        ias.push({ prefix: iaPrefix, title, id: 'condonationOfDelay' });
    }
    if (projectData.standardIas.exemptionCertifiedCopy.active) {
        const title = standardIaList.find(i => i.id === 'exemptionCertifiedCopy')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionCertifiedCopy' });
    }
    if (projectData.standardIas.exemptionOfficialTranslation.active) {
        const annexureNumberingMap = new Map<string, number>();
        let pCounter = 1;
        allAnnexures.filter(annex => !annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        allAnnexures.filter(annex => annex.isAdditionalDocument).forEach(annex => annexureNumberingMap.set(annex.id, pCounter++));
        
        const translatedAnnexures = allAnnexures
          .filter(annex => annex.copyType === 'translated copy' || annex.copyType === 'true and translated copy')
          .map(annex => annexureNumberingMap.get(annex.id))
          .filter(Boolean)
          .map(pNumber => `P-${pNumber}`);
        
        let annexureList = '';
        if (translatedAnnexures.length > 0) {
            const last = translatedAnnexures.pop();
            annexureList = translatedAnnexures.length > 0
                ? `Annexures ${translatedAnnexures.join(', ')} and ${last}`
                : `Annexure ${last}`;
        }
        
        const title = `Application for exemption from filing Official Translation(s) of ${annexureList || projectData.standardIas.exemptionOfficialTranslation.reason || 'Annexures'}`;
        ias.push({ prefix: iaPrefix, title, id: 'exemptionOfficialTranslation' });
    }
    if (projectData.standardIas.exemptionFromSurrendering.active) {
        const title = standardIaList.find(i => i.id === 'exemptionFromSurrendering')?.title || "";
        ias.push({ prefix: iaPrefix, title, id: 'exemptionFromSurrendering' });
    }
    projectData.customIas.forEach(ia => {
        ias.push({ prefix: iaPrefix, title: ia.title, id: ia.id });
    });
    return ias;
}

    