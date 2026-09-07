
"use client";

import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { differenceInDays } from 'date-fns';
import type { DraftoProject } from '@/lib/schema';
import { getAppealLimitation } from '@/lib/appeal/appeal-provisions';

export function useCalculatedValues() {
  const form = useFormContext<DraftoProject>();
  const impugnedOrders = useWatch({ control: form.control, name: 'impugnedOrders' });
  const filingDate = useWatch({ control: form.control, name: 'advocate.filingDate' });
  const courtType = useWatch({ control: form.control, name: 'courtType' });
  const caseType = useWatch({ control: form.control, name: 'caseType' });
  const appealProvision = useWatch({ control: form.control, name: 'appeal.provision' });
  const appealProvisionCustom = useWatch({ control: form.control, name: 'appeal.provisionCustom' });

  const limitation = useMemo(() => {
    return getAppealLimitation(courtType, caseType, appealProvision, appealProvisionCustom);
  }, [courtType, caseType, appealProvision, appealProvisionCustom]);

  const ioText = useMemo(() => {
    if (!impugnedOrders || impugnedOrders.length === 0) {
      return '';
    }

    const sortedOrders = [...impugnedOrders].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return sortedOrders
      .map(order => {
        const courtName = order.court === 'Other' ? order.customCourt : order.court;
        const orderDate = order.date ? new Date(order.date).toLocaleDateString('en-GB') : '[date]';
        return `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
      })
      .join(' and ');
  }, [impugnedOrders]);

  const { delay, daysDifference, isBeyondMaxDelay } = useMemo(() => {
    if (!filingDate || !impugnedOrders || impugnedOrders.length === 0) {
      return { delay: 0, daysDifference: 0, isBeyondMaxDelay: false };
    }

    const latestOrder = impugnedOrders.reduce((latest, current) => {
      return new Date(latest.date) > new Date(current.date) ? latest : current;
    });

    const diff = differenceInDays(new Date(filingDate), new Date(latestOrder.date));
    const calculatedDelay = diff - limitation.limitationDays;
    const actualDelay = Math.max(0, calculatedDelay);
    const isBeyond = limitation.maxCondonableDays != null && actualDelay > limitation.maxCondonableDays;

    return { delay: actualDelay, daysDifference: diff, isBeyondMaxDelay: isBeyond };
  }, [impugnedOrders, filingDate, limitation]);

  return {
    ioText,
    delay,
    daysDifference,
    limitationDays: limitation.limitationDays,
    maxCondonableDays: limitation.maxCondonableDays,
    hasOuterLimit: limitation.hasOuterLimit,
    provisionName: limitation.provisionName,
    isBeyondMaxDelay,
  };
}
