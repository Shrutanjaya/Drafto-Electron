// Benches of the Central Administrative Tribunal, for the OA header + the
// "Registrar, <Bench>" references (e.g. in the Petition for Transfer).
//
//  - `header` is the italic second line of the OA header.
//  - `name`   is the short form used in running text ("Registrar, <name>").

export interface OaBench {
  value: string;
  header: string;
  name: string;
  group: "Regular" | "Circuit";
}

export const OA_BENCHES: OaBench[] = [
  { value: "principal", header: "Principal Bench at New Delhi", name: "Principal Bench", group: "Regular" },
  { value: "ahmedabad", header: "Ahmedabad Bench", name: "Ahmedabad Bench", group: "Regular" },
  { value: "allahabad", header: "Allahabad Bench", name: "Allahabad Bench", group: "Regular" },
  { value: "bangalore", header: "Bangalore Bench", name: "Bangalore Bench", group: "Regular" },
  { value: "chandigarh", header: "Chandigarh Bench", name: "Chandigarh Bench", group: "Regular" },
  { value: "chennai", header: "Chennai Bench", name: "Chennai Bench", group: "Regular" },
  { value: "cuttack", header: "Cuttack Bench", name: "Cuttack Bench", group: "Regular" },
  { value: "ernakulam", header: "Ernakulam Bench", name: "Ernakulam Bench", group: "Regular" },
  { value: "guwahati", header: "Guwahati Bench", name: "Guwahati Bench", group: "Regular" },
  { value: "hyderabad", header: "Hyderabad Bench", name: "Hyderabad Bench", group: "Regular" },
  { value: "jabalpur", header: "Jabalpur Bench", name: "Jabalpur Bench", group: "Regular" },
  { value: "jaipur", header: "Jaipur Bench", name: "Jaipur Bench", group: "Regular" },
  { value: "jodhpur", header: "Jodhpur Bench", name: "Jodhpur Bench", group: "Regular" },
  { value: "kolkata", header: "Kolkata Bench", name: "Kolkata Bench", group: "Regular" },
  { value: "lucknow", header: "Lucknow Bench", name: "Lucknow Bench", group: "Regular" },
  { value: "mumbai", header: "Mumbai Bench", name: "Mumbai Bench", group: "Regular" },
  { value: "patna", header: "Patna Bench", name: "Patna Bench", group: "Regular" },
  // Circuit benches
  { value: "agartala", header: "Agartala Circuit Bench", name: "Agartala Circuit Bench", group: "Circuit" },
  { value: "aizawl", header: "Aizawl Circuit Bench", name: "Aizawl Circuit Bench", group: "Circuit" },
  { value: "aurangabad", header: "Aurangabad Circuit Bench", name: "Aurangabad Circuit Bench", group: "Circuit" },
  { value: "bilaspur", header: "Bilaspur Circuit Bench", name: "Bilaspur Circuit Bench", group: "Circuit" },
  { value: "gangtok", header: "Gangtok Circuit Bench", name: "Gangtok Circuit Bench", group: "Circuit" },
  { value: "goa", header: "Goa Circuit Bench", name: "Goa Circuit Bench", group: "Circuit" },
  { value: "gwalior", header: "Gwalior Circuit Bench", name: "Gwalior Circuit Bench", group: "Circuit" },
  { value: "imphal", header: "Imphal Circuit Bench", name: "Imphal Circuit Bench", group: "Circuit" },
  { value: "jammu", header: "Jammu Circuit Bench", name: "Jammu Circuit Bench", group: "Circuit" },
  { value: "nagpur", header: "Nagpur Circuit Bench", name: "Nagpur Circuit Bench", group: "Circuit" },
  { value: "puducherry", header: "Puducherry Circuit Bench", name: "Puducherry Circuit Bench", group: "Circuit" },
  { value: "ranchi", header: "Ranchi Circuit Bench", name: "Ranchi Circuit Bench", group: "Circuit" },
  { value: "shillong", header: "Shillong Circuit Bench", name: "Shillong Circuit Bench", group: "Circuit" },
  { value: "shimla", header: "Shimla Circuit Bench", name: "Shimla Circuit Bench", group: "Circuit" },
  { value: "srinagar", header: "Srinagar Circuit Bench", name: "Srinagar Circuit Bench", group: "Circuit" },
];

export const DEFAULT_OA_BENCH = "principal";

export function oaBench(value: string | undefined): OaBench {
  return OA_BENCHES.find((b) => b.value === value) ?? OA_BENCHES[0];
}
