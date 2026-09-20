import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from '@/components/ui/Field';

describe('Accessible Field Component', () => {
  it('connects label to input via generated htmlFor and id', () => {
    render(
      <Field label="Tên khách hàng">
        <input type="text" placeholder="Nhập tên" />
      </Field>
    );

    const input = screen.getByPlaceholderText('Nhập tên');
    const label = screen.getByText('Tên khách hàng');

    expect(label).toHaveAttribute('for', input.id);
  });

  it('renders required indicator when required is true', () => {
    render(
      <Field label="Số điện thoại" required>
        <input type="tel" />
      </Field>
    );

    const asterisk = screen.getByText('*');
    expect(asterisk).toBeInTheDocument();
  });

  it('connects error message via aria-describedby and marks aria-invalid', () => {
    render(
      <Field label="Email" error="Email không đúng định dạng">
        <input type="email" placeholder="test@example.com" />
      </Field>
    );

    const input = screen.getByPlaceholderText('test@example.com');
    const error = screen.getByRole('alert');

    expect(error).toHaveTextContent('Email không đúng định dạng');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('renders hint text and connects via aria-describedby when no error', () => {
    render(
      <Field label="Ghi chú" hint="Tối đa 100 ký tự">
        <input type="text" placeholder="Ghi chú" />
      </Field>
    );

    const input = screen.getByPlaceholderText('Ghi chú');
    const hint = screen.getByText('Tối đa 100 ký tự');

    expect(input.getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('supports render prop children', () => {
    render(
      <Field label="Địa chỉ">
        {({ id, 'aria-describedby': ariaDescribedBy }) => (
          <textarea id={id} aria-describedby={ariaDescribedBy} placeholder="Nhập địa chỉ" />
        )}
      </Field>
    );

    const textarea = screen.getByPlaceholderText('Nhập địa chỉ');
    const label = screen.getByText('Địa chỉ');
    expect(label).toHaveAttribute('for', textarea.id);
  });
});
