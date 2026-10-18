// Memo templates. {name}, {boss}, {company}, {words}, {day} get filled in.
export const WELCOME = {
  from: "Facilities",
  subject: "Welcome aboard",
  body:
    "Congratulations on founding {company}.\n\n" +
    "Your office has been prepared. The carpet is new. The hum is normal.\n\n" +
    "To get started:\n" +
    "1. Open HR Roster and hire someone. Anyone.\n" +
    "2. Open the Facility Map, click somewhere in the dark to drop a marker, and send them.\n" +
    "3. Sell whatever comes back in the Ledger.\n\n" +
    "Please do not open the door at the end of the hall yourself.\n\nHave a productive day.",
};

export const PLAQUES = [
  {
    subject: "In Memoriam: {name}",
    body:
      "Please join {company} in a moment of silence for {name}, who has resigned voluntarily and permanently.\n\n" +
      "Last recorded words: \"{words}\"\n\n" +
      "Inspiring. A pizza party has been scheduled in their honour. It has also been cancelled.\n\n- HR",
  },
  {
    subject: "Resource rotation notice: {name}",
    body:
      "{name} has been rotated out of the workforce as of Day {day}.\n\n" +
      "Their final transmission (\"{words}\") will be laminated and hung near the vending machine.\n\n" +
      "Their desk is available. Their mug is not. Nobody touches the mug.\n\n- HR",
  },
];

export const WIPE_MEMO = {
  from: "Logistics",
  subject: "Expedition outcome: total",
  body: "No one came back from today's run, so nothing came back either.\n\nThe positions have been reposted. The flyer is unchanged.\n\n- Logistics",
};

export const EMPLOYEE_OF_THE_MONTH = {
  from: "HR",
  subject: "Employee of the Month: {name}",
  body:
    "Congratulations to {name}, this month's Employee of the Month (this month began this morning).\n\n" +
    "{name} has survived {runs} expedition{s} and is now a level {level} asset.\n\n" +
    "Their prize is a laminated plaque and the privilege of going in first tomorrow.\n\n- HR",
};
