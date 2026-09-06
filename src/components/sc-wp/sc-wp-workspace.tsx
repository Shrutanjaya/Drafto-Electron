"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScWpBasicTab } from "./sc-wp-basic-tab";
import { ScWpPetitionTab } from "./sc-wp-petition-tab";
import { ScWpIasTab } from "./sc-wp-ias-tab";
import { ListingProformaTab } from "@/components/tabs/listing-proforma-tab";
import { AdvocateChecklistTab } from "@/components/tabs/advocate-checklist-tab";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";

export function ScWpWorkspace() {
  const [tab, setTab] = useState("slp");

  useEffect(() => {
    const onReveal = () => {
      const p = getPendingReveal();
      if (p?.tab) setTab(p.tab);
    };
    window.addEventListener(FIND_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(FIND_REVEAL_EVENT, onReveal);
  }, []);

  return (
    <Tabs value={tab} onValueChange={setTab} className="p-1">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="basic">Preliminary</TabsTrigger>
        <TabsTrigger value="slp">Petition</TabsTrigger>
        <TabsTrigger value="ias">Applications</TabsTrigger>
        <TabsTrigger value="proforma">Listing Proforma</TabsTrigger>
        <TabsTrigger value="checklist">Checklist</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="mt-1">
        <ScWpBasicTab />
      </TabsContent>
      <TabsContent value="slp" className="mt-1">
        <ScWpPetitionTab />
      </TabsContent>
      <TabsContent value="ias" className="mt-1">
        <ScWpIasTab />
      </TabsContent>
      <TabsContent value="proforma" className="mt-1">
        <ListingProformaTab />
      </TabsContent>
      <TabsContent value="checklist" className="mt-1">
        <AdvocateChecklistTab />
      </TabsContent>
    </Tabs>
  );
}
