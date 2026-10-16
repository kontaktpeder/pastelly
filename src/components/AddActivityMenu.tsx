import { ImageIcon, Plus } from 'lucide-react';
import CenteredPopup from '@/components/CenteredPopup';
import { useLocale } from '@/hooks/useLocale';

interface AddActivityMenuProps {
  onNew: () => void;
  onFromImage: () => void;
  onClose: () => void;
}

const AddActivityMenu = ({ onNew, onFromImage, onClose }: AddActivityMenuProps) => {
  const { t } = useLocale();
  return (
    <CenteredPopup onClose={onClose} onExit={onClose} size="hug" zClassName="z-[70]">
      <div className="px-5 py-4 space-y-2">
        <h2 className="text-lg font-bold text-center mb-3">{t('import.chooseHow')}</h2>
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-3 rounded-2xl bg-green-200 px-4 py-3.5 text-left font-semibold text-green-900 active:bg-green-300"
        >
          <Plus size={20} strokeWidth={2.4} />
          {t('event.newActivity')}
        </button>
        <button
          type="button"
          onClick={onFromImage}
          className="flex w-full items-center gap-3 rounded-2xl bg-muted px-4 py-3.5 text-left font-semibold active:bg-muted/70"
        >
          <ImageIcon size={20} strokeWidth={2.2} />
          <span>
            <span className="block">{t('import.fromImage')}</span>
            <span className="block text-xs font-normal text-muted-foreground mt-0.5">
              {t('import.fromImageHint')}
            </span>
          </span>
        </button>
      </div>
    </CenteredPopup>
  );
};

export default AddActivityMenu;
