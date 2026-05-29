
"use client";

import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { differenceInDays } from 'date-fns';
import type { DraftoProject } from '@/lib/schema';

export function useCalculatedValues() {
  const form = useFormContext<DraftoProject>();
  const impugnedOrders = useWatch({ control: form.control, name: 'impugnedOrders' });
  const filingDate = useWatch({ control: form.control, name: 'advocate.filingDate' });

  const ioText = useMemo(() => {
    if (!impugnedOrders || impugnedOrders.length === 0) {
      return '';
    }

    const sortedOrders = [...impugnedOrders].sort((a, b) => a.date.getTime() - b.date.getTime());

    return sortedOrders
      .map(order => {
        const courtName = order.court === 'Other' ? order.customCourt : order.court;
        const orderDate = order.date ? order.date.toLocaleDateString('en-GB') : '[date]';
        return `the Impugned ${order.type} dated ${orderDate} passed by the ${courtName || '[Court]'} in ${order.caseNumber || '[Case No.]'}`;
      })
      .join(' and ');
  }, [impugnedOrders]);

  const delay = useMemo(() => {
    if (!filingDate || !impugnedOrders || impugnedOrders.length === 0) {
      return 0;
    }

    const latestOrder = impugnedOrders.reduce((latest, current) => {
      return latest.date > current.date ? latest : current;
    });

    const daysDifference = differenceInDays(filingDate, latestOrder.date);
    const calculatedDelay = daysDifference - 90;

    return Math.max(0, calculatedDelay);
  }, [impugnedOrders, filingDate]);

  return { ioText, delay };
}
