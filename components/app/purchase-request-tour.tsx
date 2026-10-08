"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export type TourAudience = "FELINE" | "WORKSHOP" | "ACCOUNT" | "ACCOUNTANT";

export type TourChapter = { id: string; title: string; description: string };

type PurchaseRequestTourProps = {
  /** Each role is walked through the part of the screen it actually uses. */
  audience: TourAudience;
  /** Scopes the "already seen" flag so each person gets the tour once. */
  userId: string;
  /** Hide steps whose field or button is not on screen for this person right now. */
  showAccountWalletStep?: boolean;
  canConvertCurrency?: boolean;
  openCreateDialog: (kind?: "PURCHASE" | "COLLECTION") => void;
  closeCreateDialog: () => void;
  openCategoryPicker: () => void;
  closeCategoryPicker: () => void;
  /** Chỉ dùng cho tour kế toán: bật phiếu mẫu và mở các cửa sổ thao tác. */
  startDemoData?: () => void;
  stopDemoData?: () => void;
  openPayDialog?: () => void;
  closePayDialog?: () => void;
  openConversionDialog?: () => void;
  closeConversionDialog?: () => void;
  /** Gọi ở lần vào đầu tiên khi vai trò này có nhiều bài, để mở menu chọn bài. */
  onFirstVisit?: () => void;
  /** Bumped whenever the steps change so returning users see the new version once. */
  version?: number;
};

const SEEN_KEY_PREFIX = "purchase-request-tour-seen";

function hasSeenTour(userId: string, audience: TourAudience, version: number) {
  try {
    return window.localStorage.getItem(`${SEEN_KEY_PREFIX}:${audience}:${userId}`) === String(version);
  } catch {
    // Private mode or blocked storage: treat as seen so nobody gets the tour on every visit.
    return true;
  }
}

function markTourSeen(userId: string, audience: TourAudience, version: number) {
  try {
    window.localStorage.setItem(`${SEEN_KEY_PREFIX}:${audience}:${userId}`, String(version));
  } catch {
    // Nothing to do; the tour simply runs again next time.
  }
}

/** Waits for a dialog field to exist before driver.js tries to highlight it. */
function waitForElement(selector: string, timeoutMs = 2000) {
  return new Promise<void>((resolve) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (document.querySelector(selector) || Date.now() - startedAt > timeoutMs) {
        window.clearInterval(timer);
        resolve();
      }
    }, 60);
  });
}

export function usePurchaseRequestTour({
  audience,
  userId,
  showAccountWalletStep = false,
  canConvertCurrency = false,
  openCreateDialog,
  closeCreateDialog,
  openCategoryPicker,
  closeCategoryPicker,
  startDemoData,
  stopDemoData,
  openPayDialog,
  closePayDialog,
  openConversionDialog,
  closeConversionDialog,
  onFirstVisit,
  version = 1,
}: PurchaseRequestTourProps) {
  const driverRef = useRef<Driver | null>(null);
  const [isTourActive, setIsTourActive] = useState(false);

  const startTour = useCallback(
    (chapterId?: string) => {
    driverRef.current?.destroy();

    const rootName = audience === "WORKSHOP" ? "Supplier Theuni US" : "Feline";

    /** Người tạo yêu cầu: Feline, Xưởng, Account. */
    const buildRequesterSteps = (): DriveStep[] => [
      {
        element: '[data-tour="create-button"]',
        popover: {
          title: "Bắt đầu từ đây",
          description:
            "Mỗi khoản cần chi đều bắt đầu bằng một yêu cầu mua. Bấm nút này để mở phiếu, kế toán sẽ duyệt rồi chuyển tiền.",
          onNextClick: async () => {
            openCreateDialog();
            await waitForElement('[data-tour="form-title"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="form-title"]',
        popover: {
          title: "Tiêu đề ngắn gọn",
          description:
            'Viết đúng thứ cần mua để người duyệt hiểu ngay, ví dụ "Gia hạn ChatGPT Plus" hoặc "Top up xưởng HGT".',
          onPrevClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="create-button"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="form-description"]',
        popover: {
          title: "Mô tả chi tiết",
          description:
            "Ghi rõ mua cho ai, tài khoản nào, số tài khoản nhận nếu có. Thiếu thông tin ở đây là bị hỏi lại, phiếu sẽ chậm.",
        },
      },
      {
        element: '[data-tour="form-tags"]',
        popover: {
          title: "Tag (không bắt buộc)",
          description: "Gõ một từ khóa rồi bấm dấu + hoặc Enter. Tag giúp bạn tìm lại nhóm phiếu cùng loại về sau.",
        },
      },
      {
        element: '[data-tour="form-currency"]',
        popover: {
          title: "Chọn đúng loại tiền",
          description: "VND hay USD phải khớp với số tiền bạn nhập bên dưới. Chọn sai là số tiền duyệt sẽ sai hoàn toàn.",
        },
      },
      {
        element: '[data-tour="form-category"]',
        popover: {
          title: "Danh mục",
          description: "Bấm vào đây để mở danh sách. Chọn sai danh mục là báo cáo chi phí sẽ sai, nên bước này quan trọng.",
          onNextClick: async () => {
            openCategoryPicker();
            await waitForElement('[data-tour="category-group"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="category-group"]',
        popover: {
          title: `Cấp 1 — nhóm ${rootName}`,
          description: "Đây là nhóm ngoài cùng. Nhóm có mũi tên thì không bấm chọn được, nó chỉ để gom các mục bên trong.",
          onPrevClick: async () => {
            closeCategoryPicker();
            await waitForElement('[data-tour="form-category"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="category-subgroup"]',
        popover: {
          title: "Cấp 2 — nhóm nhỏ hơn",
          description: "Bên trong nhóm ngoài cùng là các nhóm chi phí. Đây vẫn là nhóm, vẫn chưa chọn được.",
        },
      },
      {
        element: '[data-tour="category-leaf"]',
        popover: {
          title: "Cấp 3 — bấm vào đây mới chọn được",
          description:
            "Chỉ mục ở tầng sâu nhất mới bấm chọn được. Hãy bấm sâu xuống tận mục nhỏ nhất đúng với khoản bạn đang mua, đừng dừng ở nhóm bên trên.",
          onNextClick: async () => {
            closeCategoryPicker();
            await waitForElement('[data-tour="form-amount"]');
            tour.moveNext();
          },
        },
      },
      ...(audience === "ACCOUNT"
        ? [
            {
              element: '[data-tour="form-wallet-stock"]',
              popover: {
                title: "Mua để chia lại cho team",
                description:
                  "Để nguyên ô tích nếu bạn mua sỉ rồi chia lại cho nhân viên khác — khoản này trừ vào ví của bạn và được hoàn lại khi có người lấy hàng. Bỏ tích nếu là chi tiêu riêng.",
                onPrevClick: async () => {
                  openCategoryPicker();
                  await waitForElement('[data-tour="category-leaf"]');
                  tour.movePrevious();
                },
              },
            } satisfies DriveStep,
          ]
        : []),
      ...(showAccountWalletStep
        ? [
            {
              element: '[data-tour="form-account-wallet"]',
              popover: {
                title: "Lấy hàng từ Account",
                description:
                  'Để nguyên "Mua ngoài" nếu bạn mua từ nhà cung cấp bên ngoài. Chỉ chọn tên người Account khi bạn lấy hàng có sẵn của họ, ví dụ proxy hay tài khoản họ đã mua sỉ.',
                onPrevClick: async () => {
                  openCategoryPicker();
                  await waitForElement('[data-tour="category-leaf"]');
                  tour.movePrevious();
                },
              },
            } satisfies DriveStep,
          ]
        : []),
      {
        element: '[data-tour="form-amount"]',
        popover: {
          onPrevClick:
            showAccountWalletStep || audience === "ACCOUNT"
              ? undefined
              : async () => {
                  openCategoryPicker();
                  await waitForElement('[data-tour="category-leaf"]');
                  tour.movePrevious();
                },
          title: "Số tiền đề xuất",
          description:
            "Nhập số thuần, không có dấu chấm hay phẩy. Hệ thống đọc lại thành chữ ngay bên dưới — soi dòng đó để chắc chắn không nhầm số 0.",
        },
      },
      {
        element: '[data-tour="form-receipts"]',
        popover: {
          title: "Ảnh chứng từ",
          description:
            "Kéo thả hoặc dán thẳng ảnh (Ctrl+V). Có báo giá, hóa đơn hay màn hình đơn hàng thì đính kèm luôn, phiếu sẽ được duyệt nhanh hơn.",
        },
      },
      {
        element: '[data-tour="form-submit"]',
        popover: {
          title: "Gửi phiếu",
          description: "Bấm Tạo yêu cầu là phiếu chuyển sang trạng thái chờ duyệt và báo cho kế toán.",
          onNextClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="request-table"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="request-table"]',
        popover: {
          onPrevClick: async () => {
            openCreateDialog();
            await waitForElement('[data-tour="form-submit"]');
            tour.movePrevious();
          },
          title: "Theo dõi phiếu của bạn",
          description:
            "Phiếu vừa tạo nằm ở đây. Cột Trạng thái cho biết đang chờ duyệt hay đã duyệt; cột Xác nhận chuyển tiền cho biết tiền đã chuyển chưa.",
        },
      },
      ...(audience === "ACCOUNT"
        ? [
            {
              element: 'a[href="/account-wallets"]',
              popover: {
                title: "Ví Account của bạn",
                description:
                  "Vào đây xem bạn đang ứng bao nhiêu và đã được hoàn lại bao nhiêu. Số dư âm là phần bạn còn đang gánh, chưa ai lấy lại hàng.",
              },
            } satisfies DriveStep,
          ]
        : []),
    ];

    /** Kế toán có nhiều việc nên tách thành từng bài ngắn, chọn bài nào học bài đó. */
    const accountantChapterSteps: Record<string, DriveStep[]> = {
      approve: [
      {
        element: '[data-tour="filters"]',
        popover: {
          title: "Lọc trước khi xử lý",
          description:
            "Mỗi ngày sẽ có nhiều phiếu. Lọc trạng thái Chờ duyệt để làm hết việc cần duyệt, rồi lọc Đã duyệt để đi chuyển tiền.",
        },
      },
      {
        element: '[data-tour="request-table"]',
        popover: {
          title: "Hai phiếu mẫu để bạn thử",
          description:
            "Trong lúc hướng dẫn, bảng đang hiển thị hai phiếu mẫu — một phiếu chờ duyệt và một phiếu đã duyệt chờ chuyển tiền. Bấm nút trên phiếu mẫu sẽ không ảnh hưởng gì tới dữ liệu thật.",
        },
      },
      {
        element: '[data-tour="approve-button"]',
        popover: {
          title: "Duyệt phiếu",
          description:
            "Duyệt nghĩa là đồng ý chi. Bạn chỉ duyệt được trong ngưỡng của từng danh mục — vượt ngưỡng thì phải để Admin duyệt, hệ thống sẽ báo khi bạn bấm.",
        },
      },
      {
        element: '[data-tour="reject-button"]',
        popover: {
          title: "Từ chối phải có lý do",
          description:
            "Bấm Từ chối sẽ hỏi lý do. Lý do gửi thẳng cho người tạo phiếu và lưu vào lịch sử, nên viết rõ để họ sửa đúng chỗ.",
        },
      },
      ],
      pay: [
      {
        element: '[data-tour="pay-button"]',
        popover: {
          title: "Sau khi duyệt là tới bước chuyển tiền",
          description:
            "Phiếu đã duyệt sẽ hiện nút này. Bấm Tiếp để mở cửa sổ xác nhận và xem cần điền gì.",
          onNextClick: async () => {
            openPayDialog?.();
            await waitForElement('[data-tour="pay-amount"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="pay-category"]',
        popover: {
          title: "Danh mục hạch toán",
          description:
            "Mặc định lấy theo danh mục người tạo chọn. Nếu họ chọn sai, bạn sửa ở đây trước khi chi — đây là danh mục cuối cùng được ghi vào sổ.",
          onPrevClick: async () => {
            closePayDialog?.();
            await waitForElement('[data-tour="pay-button"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="pay-amount"]',
        popover: {
          title: "Số tiền THỰC chuyển",
          description:
            "Điền đúng số bạn vừa chuyển khoản, không phải số đề xuất. Duyệt 800 USD nhưng chuyển thật 780 thì điền 780 — sổ giao dịch lấy số này.",
        },
      },
      {
        element: '[data-tour="pay-account"]',
        popover: {
          title: "Tài khoản thanh toán",
          description:
            "Chọn đúng tài khoản đã chuyển tiền đi. Thiếu bước này thì báo cáo dòng tiền theo ngân hàng sẽ không có số.",
        },
      },
      {
        element: '[data-tour="pay-transaction-id"]',
        popover: {
          title: "Transaction ID",
          description:
            "Mã giao dịch ngân hàng trả về. Điền vào đây để sau này đối soát với sao kê, và có thể tìm kiếm trong Sổ giao dịch.",
        },
      },
      {
        element: '[data-tour="pay-receipts"]',
        popover: {
          title: "Ảnh chuyển khoản",
          description:
            "Đính ảnh màn hình chuyển tiền. Bấm Tiếp để đóng cửa sổ này lại.",
          onNextClick: async () => {
            closePayDialog?.();
            await waitForElement('[data-tour="conversion-button"]');
            tour.moveNext();
          },
        },
      },
      ],
      conversion: [
      ...(canConvertCurrency
        ? [
            {
              element: '[data-tour="conversion-button"]',
              popover: {
                title: "Quy đổi tiền tệ",
                description: "Dùng khi rút USD từ ví PingPong về VND. Bấm Tiếp để mở xem.",
                onNextClick: async () => {
                  openConversionDialog?.();
                  await waitForElement('[data-tour="conversion-wallet"]');
                  tour.moveNext();
                },
              },
            } satisfies DriveStep,
            {
              element: '[data-tour="conversion-wallet"]',
              popover: {
                title: "Ví nguồn và tài khoản nhận",
                description:
                  "Chọn ví PingPong rút tiền ra, số USD quy đổi, tài khoản ngân hàng nhận và số VND thực nhận. Chênh lệch giữa hai số này chính là phí.",
                onPrevClick: async () => {
                  closeConversionDialog?.();
                  await waitForElement('[data-tour="conversion-button"]');
                  tour.movePrevious();
                },
              },
            } satisfies DriveStep,
            {
              element: '[data-tour="conversion-requests"]',
              popover: {
                title: "Gắn các phiếu đang chờ chuyển khoản",
                description:
                  "Tích những yêu cầu mua mà đợt rút tiền này dùng để chi. Không bắt buộc — có thể lưu trước rồi bấm Sửa để gắn sau.",
                onNextClick: async () => {
                  closeConversionDialog?.();
                  await waitForElement('[data-tour="collection-button"]');
                  tour.moveNext();
                },
              },
            } satisfies DriveStep,
          ]
        : []),
      ],
      collection: [
      // ---- Tạo yêu cầu thu: đi hết form ----
      {
        element: '[data-tour="collection-button"]',
        popover: {
          title: "Tạo yêu cầu thu",
          description:
            "Dùng khi có tiền vào chứ không phải chi ra: hoàn tiền, cấp quỹ vận hành, thu lại từ ví Account. Bấm Tiếp để mở form và đi hết một lượt.",
          onNextClick: async () => {
            openCreateDialog("COLLECTION");
            await waitForElement('[data-tour="form-title"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="form-requester"]',
        popover: {
          title: "Phiếu thu này của ai",
          description:
            "Chọn nhân viên nếu khoản thu thuộc về họ. Để trống thì phiếu đứng tên bạn — dùng cho các khoản thu chung của công ty.",
          onPrevClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="collection-button"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="form-title"]',
        popover: {
          title: "Tiêu đề",
          description: 'Ghi rõ nguồn tiền vào, ví dụ "Cấp quỹ vận hành tháng 10" hay "Hoàn tiền xưởng HGT".',
        },
      },
      {
        element: '[data-tour="form-description"]',
        popover: {
          title: "Mô tả",
          description: "Ghi ai chuyển, chuyển từ tài khoản nào, lý do. Đây là chỗ đối soát khi cuối tháng rà sổ.",
        },
      },
      {
        element: '[data-tour="form-tags"]',
        popover: { title: "Tag", description: "Không bắt buộc. Gắn tag để nhóm các khoản thu cùng loại cho dễ tìm." },
      },
      {
        element: '[data-tour="form-currency"]',
        popover: { title: "Loại tiền", description: "Chọn đúng VND hay USD theo số tiền thực nhận." },
      },
      {
        element: '[data-tour="form-category"]',
        popover: {
          title: "Danh mục Thu",
          description: "Bấm Tiếp để mở danh sách.",
          onNextClick: async () => {
            openCategoryPicker();
            await waitForElement('[data-tour="category-list"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="category-list"]',
        popover: {
          title: "Chỉ hiện danh mục loại Thu",
          description:
            "Form thu lọc sẵn, bạn không chọn nhầm sang danh mục Chi được. Vẫn phải chọn tới mục sâu nhất — mục có mũi tên là nhóm.",
          onNextClick: async () => {
            closeCategoryPicker();
            await waitForElement('[data-tour="form-amount"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="form-amount"]',
        popover: { title: "Số tiền", description: "Nhập số thuần, không dấu chấm phẩy. Soi dòng đọc bằng chữ bên dưới." },
      },
      {
        element: '[data-tour="form-receipts"]',
        popover: { title: "Ảnh chứng từ", description: "Đính ảnh báo có hoặc sao kê để sau này đối soát." },
      },
      {
        element: '[data-tour="form-submit"]',
        popover: {
          title: "Gửi phiếu thu",
          description: "Phiếu thu cũng qua duyệt rồi mới tới bước xác nhận đã nhận tiền.",
          onNextClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="create-button"]');
            tour.moveNext();
          },
        },
      },

      ],
      purchase: [
      // ---- Tạo yêu cầu mua hộ nhân viên: đi hết form ----
      {
        element: '[data-tour="create-button"]',
        popover: {
          title: "Tạo phiếu mua hộ nhân viên",
          description: "Khi nhân viên nhờ bạn nhập hộ. Bấm Tiếp để đi hết form mua.",
          onNextClick: async () => {
            openCreateDialog("PURCHASE");
            await waitForElement('[data-tour="form-requester"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="form-requester"]',
        popover: {
          title: "Chọn đúng người yêu cầu",
          description:
            "Bước quan trọng nhất khi nhập hộ. Chọn đúng nhân viên thì chi phí mới tính vào họ trong báo cáo; để trống là phiếu đứng tên bạn.",
          onPrevClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="create-button"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="form-title"]',
        popover: { title: "Tiêu đề", description: "Viết đúng thứ cần mua, ngắn gọn để người duyệt hiểu ngay." },
      },
      {
        element: '[data-tour="form-description"]',
        popover: {
          title: "Mô tả",
          description: "Mua cho ai, tài khoản nào, số tài khoản nhận. Nhập hộ thì càng phải ghi rõ để sau còn truy được.",
        },
      },
      {
        element: '[data-tour="form-tags"]',
        popover: { title: "Tag", description: "Không bắt buộc, dùng để nhóm các phiếu cùng loại." },
      },
      {
        element: '[data-tour="form-currency"]',
        popover: { title: "Loại tiền", description: "VND hay USD phải khớp với số tiền nhập bên dưới." },
      },
      {
        element: '[data-tour="form-category"]',
        popover: {
          title: "Danh mục",
          description: "Bấm Tiếp để mở và đi xuống đủ 3 cấp.",
          onNextClick: async () => {
            openCategoryPicker();
            await waitForElement('[data-tour="category-group"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="category-group"]',
        popover: {
          title: "Cấp 1 — nhóm gốc",
          description: "Feline hoặc Supplier Theuni US. Nhóm có mũi tên thì không chọn trực tiếp được.",
          onPrevClick: async () => {
            closeCategoryPicker();
            await waitForElement('[data-tour="form-category"]');
            tour.movePrevious();
          },
        },
      },
      {
        element: '[data-tour="category-subgroup"]',
        popover: { title: "Cấp 2 — nhóm chi phí", description: "Vẫn là nhóm, vẫn chưa chọn được." },
      },
      {
        element: '[data-tour="category-leaf"]',
        popover: {
          title: "Cấp 3 — chọn ở đây",
          description:
            "Danh mục này quyết định cả ngưỡng duyệt lẫn báo cáo chi phí, nên phải xuống tới mục nhỏ nhất đúng với khoản mua.",
          onNextClick: async () => {
            closeCategoryPicker();
            await waitForElement('[data-tour="form-amount"]');
            tour.moveNext();
          },
        },
      },
      {
        element: '[data-tour="form-amount"]',
        popover: { title: "Số tiền đề xuất", description: "Số thuần, không dấu. Kiểm lại dòng đọc bằng chữ bên dưới." },
      },
      {
        element: '[data-tour="form-receipts"]',
        popover: { title: "Ảnh chứng từ", description: "Báo giá, hóa đơn hoặc màn hình đơn hàng — có thì đính luôn." },
      },
      {
        element: '[data-tour="form-submit"]',
        popover: {
          title: "Gửi phiếu",
          description: "Phiếu vào trạng thái chờ duyệt. Bạn vẫn phải duyệt nó như mọi phiếu khác.",
          onNextClick: async () => {
            closeCreateDialog();
            await waitForElement('[data-tour="request-table"]');
            tour.moveNext();
          },
        },
      },
      ],
    };

    const buildAccountantSteps = (): DriveStep[] =>
      chapterId && accountantChapterSteps[chapterId]
        ? accountantChapterSteps[chapterId]
        : Object.values(accountantChapterSteps).flat();

    const tour = driver({
      showProgress: true,
      // Bấm ra ngoài không được thoát: người xem hay bấm nhầm vào lớp mờ rồi mất bài.
      allowClose: false,
      // Bấm vào lớp mờ không làm gì cả, tránh vừa thoát nhầm vừa nhảy bước nhầm.
      overlayClickBehavior: () => {},
      showButtons: ["next", "previous", "close"],
      // Nút bỏ qua ghi rõ chữ, dấu X nhỏ ở góc nhiều người không để ý.
      onPopoverRender: (popover) => {
        if (popover.footer.querySelector("[data-tour-skip]")) return;
        const skipButton = document.createElement("button");
        skipButton.type = "button";
        skipButton.dataset.tourSkip = "true";
        skipButton.textContent = "Bỏ qua";
        skipButton.className = "driver-popover-footer-btn";
        skipButton.style.marginRight = "auto";
        skipButton.addEventListener("click", () => tour.destroy());
        popover.footer.insertBefore(skipButton, popover.footer.firstChild);
      },
      overlayOpacity: 0.6,
      nextBtnText: "Tiếp",
      prevBtnText: "Quay lại",
      doneBtnText: "Đã hiểu",
      progressText: "Bước {{current}}/{{total}}",
      onDestroyed: () => {
        markTourSeen(userId, audience, version);
        setIsTourActive(false);
        closeCategoryPicker();
        closeCreateDialog();
        closePayDialog?.();
        closeConversionDialog?.();
        stopDemoData?.();
      },
      steps: audience === "ACCOUNTANT" ? buildAccountantSteps() : buildRequesterSteps(),
    });

    driverRef.current = tour;
    setIsTourActive(true);
    // Phiếu mẫu chỉ cần cho bài duyệt và bài chuyển tiền.
    if (audience === "ACCOUNTANT" && (!chapterId || chapterId === "approve" || chapterId === "pay")) {
      startDemoData?.();
    }
    tour.drive();
    },
    [
    audience,
    canConvertCurrency,
    closeCategoryPicker,
    closeCreateDialog,
    closeConversionDialog,
    closePayDialog,
    openCategoryPicker,
    openConversionDialog,
    openCreateDialog,
    openPayDialog,
    showAccountWalletStep,
    startDemoData,
    stopDemoData,
    userId,
    version,
  ]);

  // First visit only: give the tour a moment so the table and buttons are mounted.
  useEffect(() => {
    if (!userId || hasSeenTour(userId, audience, version)) return;
    const timer = window.setTimeout(() => {
      if (audience === "ACCOUNTANT") {
        // Nhiều bài quá nên mở menu cho chọn, đồng thời đánh dấu đã giới thiệu.
        markTourSeen(userId, audience, version);
        onFirstVisit?.();
        return;
      }
      startTour();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [audience, onFirstVisit, startTour, userId, version]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  const chapters: TourChapter[] =
    audience === "ACCOUNTANT"
      ? [
          { id: "approve", title: "Quy trình duyệt yêu cầu", description: "Lọc phiếu, đọc một dòng, duyệt và từ chối" },
          { id: "pay", title: "Xác nhận chuyển tiền", description: "Số tiền thực chuyển, tài khoản, Transaction ID, ảnh" },
          { id: "conversion", title: "Quy đổi tiền tệ", description: "Rút USD từ ví PingPong và gắn phiếu chờ chi" },
          { id: "collection", title: "Tạo yêu cầu thu", description: "Đi hết form thu, từ tiêu đề tới lúc gửi" },
          { id: "purchase", title: "Tạo yêu cầu mua hộ nhân viên", description: "Đi hết form mua, nhấn mạnh chọn đúng người" },
        ]
      : [];

  return { startTour, isTourActive, chapters };
}
