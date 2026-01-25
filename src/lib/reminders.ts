import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ReminderStatus = "OPEN" | "DONE" | "SNOOZED";

export async function createReminderForDueDate(args: {
  petId: string;
  type: string;
  title: string;
  dueAt: Date;
}) {
  // Default: due at 10:00 AM local time
  const due = new Date(args.dueAt);
  if (due.getHours() === 0 && due.getMinutes() === 0) {
    due.setHours(10, 0, 0, 0);
  }
  await addDoc(collection(db, "reminders"), {
    petId: args.petId,
    type: args.type,
    title: args.title,
    dueAt: Timestamp.fromDate(due),
    status: "OPEN" as ReminderStatus,
    createdAt: Timestamp.now(),
  });
}

export async function createMedicationReminders(args: {
  petId: string;
  petName: string;
  medicationId: string;
  name: string;
  startOn: Date;
  endOn: Date | null;
  times: string[]; // "HH:MM"
  daysAhead: number;
}) {
  const now = new Date();
  const start = args.startOn > now ? args.startOn : now;
  const endLimit = new Date();
  endLimit.setDate(endLimit.getDate() + args.daysAhead);

  const finalEnd = args.endOn && args.endOn < endLimit ? args.endOn : endLimit;

  // Create reminders for each day and each time within window.
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);

  while (day <= finalEnd) {
    for (const t of args.times.length ? args.times : ["09:00"]) {
      const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

      const due = new Date(day);
      due.setHours(hh, mm, 0, 0);

      if (due < start) continue;
      if (due > finalEnd) continue;

      await addDoc(collection(db, "reminders"), {
        petId: args.petId,
        type: "MEDICATION",
        title: `${args.petName}: ${args.name} (${t})`,
        dueAt: Timestamp.fromDate(due),
        status: "OPEN" as ReminderStatus,
        medicationId: args.medicationId,
        createdAt: Timestamp.now(),
      });
    }
    day.setDate(day.getDate() + 1);
  }
}
