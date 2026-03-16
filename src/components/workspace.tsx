
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BasicTab } from "./tabs/basic-tab";
import { SlpTab } from "./tabs/slp-tab";
import { IasTab } from "./tabs/ias-tab";
import { ListingProformaTab } from "./tabs/listing-proforma-tab";
import { AdvocateChecklistTab } from "./tabs/advocate-checklist-tab";

export function Workspace() {
  return (
    <Tabs defaultValue="slp" className="p-1">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="slp">The SLP</TabsTrigger>
        <TabsTrigger value="ias">The IAs</TabsTrigger>
        <TabsTrigger value="proforma">Listing Proforma</TabsTrigger>
        <TabsTrigger value="checklist">Advocate's Checklist</TabsTrigger>
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

    