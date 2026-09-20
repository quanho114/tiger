import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';

function DialogHarness({ defaultOpen = true, closeOnOverlay = true }: { defaultOpen?: boolean; closeOnOverlay?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div>
      <button type="button" data-testid="open-trigger" onClick={() => setIsOpen(true)}>
        Mở Dialog
      </button>

      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Tiêu đề thử nghiệm"
        description="Mô tả hộp thoại thử nghiệm"
        closeOnOverlayClick={closeOnOverlay}
      >
        <div>
          <h3>Nội dung hộp thoại</h3>
          <input type="text" data-testid="dialog-input-1" placeholder="Ô nhập 1" />
          <input type="text" data-testid="dialog-input-2" placeholder="Ô nhập 2" />
          <button type="button" data-testid="dialog-submit" onClick={() => setIsOpen(false)}>
            Lưu
          </button>
          <button type="button" data-testid="dialog-close-btn" onClick={() => setIsOpen(false)}>
            Đóng
          </button>
        </div>
      </Dialog>
    </div>
  );
}

describe('Accessible Dialog Component (WCAG 2.2)', () => {
  it('does not render into DOM when isOpen is false', () => {
    render(<DialogHarness defaultOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders with role="dialog" and aria-modal="true" when isOpen is true', () => {
    render(<DialogHarness defaultOpen={true} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('focuses first focusable element when opened', async () => {
    render(<DialogHarness defaultOpen={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('dialog-input-1')).toHaveFocus();
    });
  });

  it('closes when Escape key is pressed', async () => {
    render(<DialogHarness defaultOpen={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes when backdrop/overlay is clicked if closeOnOverlayClick is true', async () => {
    render(<DialogHarness defaultOpen={true} closeOnOverlay={true} />);
    const overlay = screen.getByTestId('dialog-overlay');
    fireEvent.click(overlay);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('does not close when clicking inside dialog content', async () => {
    render(<DialogHarness defaultOpen={true} closeOnOverlay={true} />);
    const content = screen.getByTestId('dialog-content');
    fireEvent.click(content);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restores focus to trigger element when closed', async () => {
    render(<DialogHarness defaultOpen={false} />);
    const trigger = screen.getByTestId('open-trigger');
    trigger.focus();
    expect(trigger).toHaveFocus();

    // Open
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByTestId('dialog-close-btn');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger).toHaveFocus();
    });
  });

  it('traps focus within dialog (Tab and Shift+Tab cycling)', async () => {
    render(<DialogHarness defaultOpen={true} />);
    const input1 = screen.getByTestId('dialog-input-1');
    const closeBtn = screen.getByTestId('dialog-close-btn');

    await waitFor(() => expect(input1).toHaveFocus());

    // Shift+Tab from first element wraps to last element
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(closeBtn).toHaveFocus();

    // Tab from last element wraps back to first element
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    expect(input1).toHaveFocus();
  });
});
