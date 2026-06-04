import type { MailBuilderState } from "@/components/mail-builder-form";

export interface BlockProps {
  state: MailBuilderState;
  onChange: (partial: Partial<MailBuilderState>) => void;
  triggerUpload: (fieldKey: string, onSuccess: (url: string) => void) => void;
  uploadingField: string | null;
  uploadError: string | null;
}
