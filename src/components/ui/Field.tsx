import {
  useId,
  type ReactNode,
  type ReactElement,
  cloneElement,
  isValidElement,
} from 'react';

export interface FieldProps {
  label: ReactNode;
  id?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children:
    | ReactNode
    | ((props: {
        id: string;
        'aria-describedby'?: string;
        'aria-invalid'?: boolean;
        required?: boolean;
      }) => ReactNode);
}

export function Field({
  label,
  id: explicitId,
  error,
  hint,
  required,
  className = '',
  children,
}: FieldProps) {
  const generatedId = useId();
  const fieldId = explicitId || generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const describedByParts: string[] = [];
  if (error) describedByParts.push(errorId);
  if (hint) describedByParts.push(hintId);
  const ariaDescribedBy = describedByParts.length > 0 ? describedByParts.join(' ') : undefined;

  const childProps = {
    id: fieldId,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': error ? true : undefined,
    required,
  };

  let renderedChild: ReactNode;
  if (typeof children === 'function') {
    renderedChild = children(childProps);
  } else if (isValidElement(children)) {
    renderedChild = cloneElement(children as ReactElement<Record<string, unknown>>, childProps);
  } else {
    renderedChild = children;
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={fieldId}
        className="block text-xs font-semibold text-[#000000]/80"
      >
        {label}
        {required && (
          <span className="text-[#ed7328] ml-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {renderedChild}

      {hint && !error && (
        <p id={hintId} className="text-xs text-[#000000]/60">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-red-600 animate-in fade-in duration-150">
          {error}
        </p>
      )}
    </div>
  );
}
