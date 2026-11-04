import { AlertCircle } from 'lucide-react';
import { classNames } from '../utils.js';

export function Field({ label, required, error, hint, children, className, htmlFor }) {
  return (
    <div className={classNames('field', error && 'field-error', className)}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="required" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-message error">
          <AlertCircle size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="field-message">{hint}</span>
      ) : null}
    </div>
  );
}

export function TextInput({ className, error, ...props }) {
  return <input className={classNames('input', error && 'input-invalid', className)} {...props} />;
}

export function MoneyInput({ className, error, prefix = '$', ...props }) {
  return (
    <div className={classNames('input-affix', error && 'input-invalid', className)}>
      <span>{prefix}</span>
      <input className="input-unstyled" inputMode="decimal" {...props} />
    </div>
  );
}

export function Select({ className, error, children, ...props }) {
  return (
    <select className={classNames('input select', error && 'input-invalid', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, error, ...props }) {
  return <textarea className={classNames('input textarea', error && 'input-invalid', className)} {...props} />;
}

export function Checkbox({ label, description, checked, onChange, disabled, className }) {
  return (
    <label className={classNames('checkbox-row', disabled && 'is-disabled', className)}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange?.(event.target.checked)} disabled={disabled} />
      <span className="checkbox-box" aria-hidden="true" />
      <span className="checkbox-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

export function Segmented({ options, value, onChange, name, ariaLabel, disabled = false }) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel || name}>
      {options.map((option) => {
        const optionValue = option.value ?? option;
        const optionLabel = option.label ?? option;
        return (
          <button
            type="button"
            key={optionValue}
            className={classNames('segmented-option', String(value) === String(optionValue) && 'active')}
            onClick={() => !disabled && onChange?.(optionValue)}
            aria-pressed={String(value) === String(optionValue)}
            disabled={disabled}
          >
            {option.icon}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

export function FormGrid({ columns = 2, children, className }) {
  return <div className={classNames('form-grid', `cols-${columns}`, className)}>{children}</div>;
}

export function FormSection({ number, title, description, children, aside, className }) {
  return (
    <section className={classNames('form-section', className)}>
      <header className="form-section-header">
        <div>
          {number && <span className="form-section-number">{number}</span>}
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {aside}
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

export function InlineNotice({ tone = 'info', icon: Icon = AlertCircle, children, className }) {
  return (
    <div className={classNames('inline-notice', `tone-${tone}`, className)}>
      <Icon size={17} />
      <div>{children}</div>
    </div>
  );
}
