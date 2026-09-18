import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useLocale } from '@/hooks/useLocale';
import {
  useCreateListItem,
  useDeleteListItem,
  useListItemsForDate,
  useToggleListItem,
  useUpdateListItem,
  type ListItem,
} from '@/hooks/useListItems';
import { focusFieldSoftly, scrollFocusIntoView } from '@/lib/scrollFocusIntoView';

interface DayListItemsProps {
  date: Date;
  householdId: string;
  currentMemberId: string;
}

const DayListItems = ({ date, householdId, currentMemberId }: DayListItemsProps) => {
  const { t } = useLocale();
  const dateStr = format(date, 'yyyy-MM-dd');
  const { data: listItems = [] } = useListItemsForDate(householdId, dateStr);
  const createItem = useCreateListItem();
  const toggleItem = useToggleListItem();
  const updateItem = useUpdateListItem();
  const deleteItem = useDeleteListItem();
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingId) return;
    const id = window.setTimeout(() => focusFieldSoftly(editInputRef.current), 40);
    return () => window.clearTimeout(id);
  }, [editingId]);

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    createItem.mutate({
      household_id: householdId,
      title: newItem.trim(),
      item_date: dateStr,
      owner_member_id: currentMemberId,
    });
    setNewItem('');
    inputRef.current?.focus();
  };

  const startEdit = (item: ListItem) => {
    setEditingId(item.id);
    setEditText(item.title);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    const id = editingId;
    setEditingId(null);
    if (!trimmed) return;
    const current = listItems.find((i) => i.id === id);
    if (current && current.title === trimmed) return;
    updateItem.mutate({ id, title: trimmed });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  return (
    <div className="pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
        {t('event.list')}
      </p>
      <div>
        {listItems.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex items-center gap-2 py-1.5 border-b border-border/40">
              <button
                type="button"
                onClick={() => {
                  if (isEditing) return;
                  toggleItem.mutate({ id: item.id, is_checked: !item.is_checked });
                }}
                className={`w-4 h-4 shrink-0 border ${
                  item.is_checked ? 'bg-foreground border-foreground' : 'border-foreground/40'
                }`}
                aria-label={item.is_checked ? 'Avmerk' : 'Merk som ferdig'}
              />
              {isEditing ? (
                <input
                  ref={editInputRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onFocus={scrollFocusIntoView}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="flex-1 min-w-0 bg-transparent py-0.5 text-sm focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className={`flex-1 min-w-0 text-left text-sm ${
                    item.is_checked ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {item.title}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (editingId === item.id) cancelEdit();
                  deleteItem.mutate(item.id);
                }}
                className="p-1 text-muted-foreground shrink-0"
                aria-label="Slett"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pt-1.5">
        <input
          ref={inputRef}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
          onFocus={scrollFocusIntoView}
          placeholder={t('event.addListItem')}
          className="flex-1 min-w-0 bg-transparent py-1 text-sm border-b border-border/50 focus:outline-none focus:border-foreground/40"
        />
        <button
          type="button"
          onClick={handleAddItem}
          disabled={!newItem.trim()}
          className="text-sm font-semibold text-foreground disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
};

export default DayListItems;
