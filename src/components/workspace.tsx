
"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BasicTab } from "./tabs/basic-tab";
import { SlpTab } from "./tabs/slp-tab";
import { IasTab } from "./tabs/ias-tab";
import { ListingProformaTab } from "./tabs/listing-proforma-tab";
import { AdvocateChecklistTab } from "./tabs/advocate-checklist-tab";
import { FIND_REVEAL_EVENT, getPendingReveal } from "@/lib/find-reveal";

export function Workspace() {
  const [tab, setTab] = useState("slp");

  // Find & Replace navigation can target any tab — switch to the match's tab.
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
        <BasicTab />
      </TabsContent>
      <TabsContent value="slp" className="mt-1">
        <SlpTab />
      </TabsContent>
      <TabsContent value="ias" className="mt-1">
        <IasTab />
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

    