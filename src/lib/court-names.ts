/**
 * Official formal names for High Courts when generating court documents (DOCX).
 * Preserves the concise/practical labels used in the dropdown while outputting
 * the exact formal designation in pleadings, memo of parties, synopsis, etc.
 */
export const HIGH_COURT_OFFICIAL_NAMES: Record<string, string> = {
  "Allahabad High Court at Allahabad": "High Court of Judicature at Allahabad",
  "Allahabad High Court at Lucknow": "High Court of Judicature at Allahabad, Lucknow Bench",
  "Andhra Pradesh High Court at Amaravati": "High Court of Andhra Pradesh at Amaravati",
  "Bombay High Court at Mumbai": "High Court of Judicature at Bombay",
  "Bombay High Court at Nagpur": "High Court of Judicature at Bombay, Bench at Nagpur",
  "Bombay High Court at Aurangabad": "High Court of Judicature at Bombay, Bench at Aurangabad",
  "Bombay High Court at Panaji (Goa)": "High Court of Judicature at Bombay at Goa",
  "Calcutta High Court at Kolkata": "High Court at Calcutta",
  "Calcutta High Court at Port Blair": "High Court at Calcutta, Circuit Bench at Port Blair",
  "Chhattisgarh High Court at Bilaspur": "High Court of Chhattisgarh at Bilaspur",
  "Delhi High Court at New Delhi": "High Court of Delhi at New Delhi",
  "Gauhati High Court at Guwahati": "Gauhati High Court (High Court of Assam, Nagaland, Mizoram and Arunachal Pradesh) at Guwahati",
  "Gauhati High Court at Aizawl": "Gauhati High Court, Aizawl Bench",
  "Gauhati High Court at Itanagar": "Gauhati High Court, Itanagar Permanent Bench",
  "Gauhati High Court at Kohima": "Gauhati High Court, Kohima Bench",
  "Gauhati High Court at Shillong": "High Court of Meghalaya at Shillong",
  "Gauhati High Court at Imphal": "High Court of Manipur at Imphal",
  "Gujarat High Court at Ahmedabad": "High Court of Gujarat at Ahmedabad",
  "Himachal Pradesh High Court at Shimla": "High Court of Himachal Pradesh at Shimla",
  "Jammu & Kashmir and Ladakh High Court at Jammu": "High Court of Jammu & Kashmir and Ladakh at Jammu",
  "Jammu & Kashmir and Ladakh High Court at Srinagar": "High Court of Jammu & Kashmir and Ladakh at Srinagar",
  "Jharkhand High Court at Ranchi": "High Court of Jharkhand at Ranchi",
  "Karnataka High Court at Bengaluru": "High Court of Karnataka at Bengaluru",
  "Karnataka High Court at Dharwad": "High Court of Karnataka, Dharwad Bench",
  "Karnataka High Court at Kalaburagi": "High Court of Karnataka, Kalaburagi Bench",
  "Kerala High Court at Ernakulam": "High Court of Kerala at Ernakulam",
  "Madhya Pradesh High Court at Jabalpur": "High Court of Madhya Pradesh at Jabalpur",
  "Madhya Pradesh High Court at Indore": "High Court of Madhya Pradesh, Bench at Indore",
  "Madhya Pradesh High Court at Gwalior": "High Court of Madhya Pradesh, Bench at Gwalior",
  "Madras High Court at Chennai": "High Court of Judicature at Madras",
  "Madras High Court at Madurai": "High Court of Judicature at Madras, Madurai Bench",
  "Manipur High Court at Imphal": "High Court of Manipur at Imphal",
  "Meghalaya High Court at Shillong": "High Court of Meghalaya at Shillong",
  "Orissa High Court at Cuttack": "High Court of Orissa at Cuttack",
  "Patna High Court at Patna": "High Court of Judicature at Patna",
  "Punjab & Haryana High Court at Chandigarh": "High Court of Punjab & Haryana at Chandigarh",
  "Rajasthan High Court at Jodhpur": "High Court of Judicature for Rajasthan at Jodhpur",
  "Rajasthan High Court at Jaipur": "High Court of Judicature for Rajasthan, Bench at Jaipur",
  "Sikkim High Court at Gangtok": "High Court of Sikkim at Gangtok",
  "Telangana High Court at Hyderabad": "High Court for the State of Telangana at Hyderabad",
  "Tripura High Court at Agartala": "High Court of Tripura at Agartala",
  "Uttarakhand High Court at Nainital": "High Court of Uttarakhand at Nainital",
};

/**
 * Resolves a court name from the database/form into its official formal name
 * for DOCX generation and legal text output.
 */
export function getOfficialCourtName(court?: string, customCourt?: string): string {
  if (!court && !customCourt) return "";
  if (court === "Other") return customCourt || "";
  if (!court) return customCourt || "";
  return HIGH_COURT_OFFICIAL_NAMES[court] || court;
}
