interface InputFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'password' | 'email';
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  description?: string;
  required?: boolean;
}

export default function InputField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  description,
  required = false
}: InputFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && (
          <span style={{ color: 'var(--destructive)', marginLeft: 'var(--spacing-1)' }}>
            *
          </span>
        )}
      </label>
      <input
        type={type}
        id={id}
        className="input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
      />
      {description && (
        <p style={{ 
          fontSize: '0.75rem', 
          color: 'var(--muted-foreground)', 
          marginTop: 'var(--spacing-1)',
          lineHeight: '1.4'
        }}>
          {description}
        </p>
      )}
    </div>
  );
} 
