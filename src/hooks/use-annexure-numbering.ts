"use client"

import { useMemo } from 'react';
import type { LodTableItem, Annexure } from '@/lib/schema';

interface NumberedAnnexure extends Annexure {
    lodId: string;
    pNumber: number;
}

export function useAnnexureNumbering(listOfDates: LodTableItem[]) {
    const numberedAnnexures = useMemo(() => {
        const allAnnexures: {annex: Annexure, lodId: string}[] = [];
        
        listOfDates.forEach(lod => {
            if (lod.annexures) {
                lod.annexures.forEach(annex => {
                    allAnnexures.push({ annex, lodId: lod.id });
                });
            }
        });

        const nonAdAnnexures = allAnnexures.filter(item => !item.annex.isAdditionalDocument);
        const adAnnexures = allAnnexures.filter(item => item.annex.isAdditionalDocument);

        const numbered: NumberedAnnexure[] = [];
        let currentPNumber = 1;

        nonAdAnnexures.forEach(item => {
            numbered.push({
                ...item.annex,
                lodId: item.lodId,
                pNumber: currentPNumber++,
            });
        });
        
        adAnnexures.forEach(item => {
            numbered.push({
                ...item.annex,
                lodId: item.lodId,
                pNumber: currentPNumber++,
            });
        });

        return numbered;
    }, [listOfDates]);

    return { numberedAnnexures };
}
