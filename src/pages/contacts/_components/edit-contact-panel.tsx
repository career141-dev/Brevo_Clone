import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button.tsx";

type Props = { contactId: string; onClose: () => void };

export default function EditContactPanel({ contactId, onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[440px] bg-background border-l p-6 shadow-2xl"
      >
        <h2 className="text-xl font-bold">Edit Contact</h2>
        <p className="text-muted-foreground mt-2">Contact ID: {contactId}</p>
        <Button onClick={onClose} className="mt-4">Close</Button>
      </motion.div>
    </AnimatePresence>
  );
}
