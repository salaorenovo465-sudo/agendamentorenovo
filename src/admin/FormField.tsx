import { toStringValue } from './AdminUtils';
import type { FieldConfig } from './AdminUtils';

export function FormField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const baseClass = 'admin-input';

  if (field.type === 'textarea') {
    return <textarea className={baseClass} rows={3} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)} />;
  }

  if (field.type === 'select') {
    return (
      <select className={baseClass} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }

  const htmlType = field.type === 'number' ? 'number' : field.type;

  return (
    <input
      className={baseClass}
      type={htmlType}
      value={toStringValue(value)}
      onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value || 0) : event.target.value)}
    />
  );
}
