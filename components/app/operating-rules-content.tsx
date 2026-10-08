import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Rule = {
  title: string;
  paragraphs: string[];
};

type Section = {
  title: string;
  intro?: string[];
  rules?: Rule[];
  paragraphs?: string[];
};

const sections: Section[] = [
  {
    title: "I. Mục Đích",
    paragraphs: [
      "Quy định này được xây dựng nhằm thống nhất nguyên tắc làm việc của Phòng Kế toán, đảm bảo các hoạt động liên quan đến tiền, tài khoản, thu - chi và dữ liệu tài chính của công ty được thực hiện đầy đủ, chính xác, minh bạch và có thể kiểm tra, đối soát khi cần thiết.",
      "Tất cả nhân sự thuộc Phòng Kế toán và các cá nhân được giao quyền quản lý, phê duyệt hoặc sử dụng nguồn tiền của công ty có trách nhiệm tuân thủ các quy định dưới đây.",
    ],
  },
  {
    title: "II. Quy Định Chung",
    rules: [
      {
        title: "RULE 01 - Mọi dòng tiền phải được ghi nhận",
        paragraphs: [
          "Tất cả các khoản Thu - Chi - Hoàn tiền - Chuyển tiền giữa các tài khoản và các biến động tiền khác thuộc công ty phải được ghi nhận đầy đủ trên hệ thống theo quy định.",
          "Không được tồn tại giao dịch ngoài hệ thống mà không có thông tin hoặc căn cứ để kiểm tra lại.",
          "Mỗi giao dịch tối thiểu phải xác định được: Số tiền - Nội dung - Người/Bộ phận liên quan - Nguồn tiền - Thời gian - Trạng thái giao dịch.",
        ],
      },
      {
        title: "RULE 02 - Không có request hợp lệ, không thực hiện chi",
        paragraphs: [
          "Mọi khoản chi của công ty phải được tạo Request và phê duyệt theo đúng Quy trình Quản lý Thu - Chi trước khi thanh toán.",
          "Người giữ tiền hoặc thực hiện thanh toán không được tự ý chi khi chưa có yêu cầu và phê duyệt hợp lệ.",
          "Trường hợp đặc biệt hoặc khẩn cấp phải được xử lý theo quy định riêng và bổ sung đầy đủ thông tin lên hệ thống.",
        ],
      },
      {
        title: "RULE 03 - Tuân thủ đúng thẩm quyền và hạn mức",
        paragraphs: [
          "Mỗi vị trí chỉ được phê duyệt, thanh toán, quản lý quỹ và sử dụng tài khoản trong phạm vi quyền hạn và hạn mức được công ty giao.",
          "Các khoản vượt hạn mức phải được chuyển lên cấp có thẩm quyền cao hơn để xem xét. Không được tự ý vượt quyền nếu chưa được chấp thuận.",
        ],
      },
      {
        title: "RULE 04 - Không chia nhỏ giao dịch để né hạn mức phê duyệt",
        paragraphs: [
          "Không được cố tình chia một khoản chi thành nhiều giao dịch nhỏ nhằm đưa từng giao dịch xuống dưới hạn mức phê duyệt. Các khoản chi có cùng mục đích hoặc thuộc cùng một nghĩa vụ thanh toán cần được ghi nhận đúng bản chất giao dịch.",
        ],
      },
    ],
  },
  {
    title: "III. Quản Lý Tiền Và Tài Khoản",
    rules: [
      {
        title: "RULE 05 - Tách biệt tiền công ty và tiền cá nhân",
        paragraphs: [
          "Tiền và tài khoản của công ty chỉ được sử dụng cho hoạt động của công ty. Không sử dụng tiền công ty cho mục đích cá nhân, tài khoản công ty cho giao dịch cá nhân.",
          "Nếu sử dụng tiền cá nhân để xử lý giao dịch công ty thì cần phải có ghi nhận, thông tin đối chiếu để được công ty cấp lại sau.",
          "Trường hợp cá nhân ứng tiền hoặc hoàn trả tiền cho công ty phải được ghi nhận rõ ràng trên hệ thống.",
        ],
      },
      {
        title: "RULE 06 - Mỗi nguồn tiền phải có người chịu trách nhiệm",
        paragraphs: [
          "Mỗi Bank, ví, PingPong, quỹ hoặc tài khoản tài chính của công ty phải xác định rõ người được giao quản lý.",
          "Người quản lý có trách nhiệm bảo quản thông tin tài khoản, theo dõi biến động, thực hiện giao dịch đúng thẩm quyền, phối hợp đối soát và báo cáo ngay khi phát hiện bất thường.",
        ],
      },
      {
        title: "RULE 07 - Không tự ý luân chuyển nguồn tiền",
        paragraphs: [
          "Việc chuyển tiền giữa các Bank, ví, PingPong, quỹ hoặc các nguồn tiền khác của công ty phải có nội dung và mục đích rõ ràng. Mọi giao dịch luân chuyển nội bộ phải được ghi nhận để tránh ghi nhận sai Thu - Chi thực tế.",
        ],
      },
    ],
  },
  {
    title: "IV. Dữ Liệu Và Chứng Từ",
    rules: [
      {
        title: "RULE 08 - Mọi giao dịch phải có khả năng truy vết",
        paragraphs: [
          "Mỗi giao dịch phải đảm bảo có thể xác định được: Ai yêu cầu - Ai phê duyệt - Nội dung gì - Bao nhiêu tiền - Nguồn tiền nào - Ai thực hiện - Giao dịch nào - Chứng từ nào.",
        ],
      },
      {
        title: "RULE 09 - Không tự ý sửa hoặc xóa dữ liệu",
        paragraphs: [
          "Các giao dịch đã hoàn tất không được tự ý sửa hoặc xóa khỏi hệ thống. Nếu cần điều chỉnh phải ghi nhận rõ nội dung điều chỉnh, lý do, người thực hiện và thời gian điều chỉnh. Dữ liệu phải có khả năng kiểm tra lại lịch sử khi cần thiết.",
        ],
      },
      {
        title: "RULE 10 - Dữ liệu phải có căn cứ",
        paragraphs: [
          "Không ghi nhận số liệu tài chính chỉ dựa trên thông tin miệng hoặc số liệu không xác định được nguồn. Các số liệu quan trọng phải có căn cứ từ hệ thống, tài khoản thực tế, chứng từ hoặc nguồn dữ liệu được công ty công nhận.",
        ],
      },
    ],
  },
  {
    title: "V. Đối Soát",
    rules: [
      {
        title: "RULE 11 - Dữ liệu hệ thống phải được đối chiếu với tiền thực tế",
        paragraphs: [
          "Phòng Kế toán có trách nhiệm kiểm tra định kỳ dữ liệu trên hệ thống Feline Accountant với các nguồn tiền thực tế của công ty.",
          "Nguyên tắc: Số dư đầu kỳ + Tổng Thu - Tổng Chi = Số dư cuối kỳ.",
          "Số dư cuối kỳ trên hệ thống phải được đối chiếu với số dư thực tế của từng tài khoản.",
        ],
      },
      {
        title: "RULE 12 - Mọi chênh lệch phải được xác định nguyên nhân",
        paragraphs: [
          "Không được bỏ qua hoặc tự ý cân bằng số liệu khi xuất hiện chênh lệch. Mỗi khoản chênh lệch phải được phát hiện, kiểm tra, xác định nguyên nhân, xử lý/ghi nhận và xác nhận hoàn tất. Khoản chưa xác định được nguyên nhân phải được theo dõi riêng.",
        ],
      },
      {
        title: "RULE 13 - Kiểm tra hệ thống theo lịch",
        paragraphs: [
          "Hằng ngày: kiểm tra các giao dịch phát sinh và tình trạng cập nhật thông tin/chứng từ.",
          "Hằng tuần: đối chiếu dữ liệu Thu - Chi và số dư trên Feline Accountant với Bank, ví và PingPong thực tế.",
          "Hằng tháng: chốt số liệu, kiểm tra tổng thể số dư và xử lý các khoản chênh lệch còn tồn tại.",
        ],
      },
    ],
  },
  {
    title: "VI. Bảo Mật",
    rules: [
      {
        title: "RULE 14 - Bảo mật thông tin tài chính",
        paragraphs: [
          "Thông tin liên quan đến Bank, ví, PingPong, mật khẩu, OTP, số dư, dữ liệu giao dịch và báo cáo tài chính nội bộ chỉ được cung cấp cho người có thẩm quyền. Không chia sẻ thông tin tài khoản, mật khẩu hoặc OTP cho người không được phân quyền.",
        ],
      },
      {
        title: "RULE 15 - Tài khoản cá nhân, trách nhiệm cá nhân",
        paragraphs: [
          "Mỗi nhân sự phải sử dụng tài khoản hệ thống được cấp cho chính mình. Không sử dụng chung tài khoản Feline Accountant hoặc tài khoản quản trị nếu không được công ty cho phép. Các thao tác bằng tài khoản được cấp là căn cứ xác định lịch sử thao tác và trách nhiệm liên quan.",
        ],
      },
    ],
  },
  {
    title: "VII. Báo Cáo Và Xử Lý Bất Thường",
    rules: [
      {
        title: "RULE 16 - Bất thường tài chính phải được báo cáo kịp thời",
        paragraphs: [
          "Các trường hợp chuyển nhầm tiền, chi sai số tiền, nhận thiếu/thừa tiền, giao dịch không xác định được nguồn, số dư không khớp hệ thống, giao dịch trùng, mất quyền truy cập hoặc giao dịch bất thường phải được báo ngay cho cấp quản lý có thẩm quyền.",
          "Không tự ý che giấu, tự cân bằng số liệu hoặc chờ đến kỳ báo cáo mới thông báo.",
        ],
      },
      {
        title: "RULE 17 - Báo cáo phải dựa trên dữ liệu đã được kiểm tra",
        paragraphs: [
          "Các báo cáo Thu - Chi, số dư và dòng tiền gửi cho cấp quản lý phải dựa trên dữ liệu đã được kiểm tra theo quy định. Nếu còn số liệu chưa đối soát hoặc khoản chênh lệch chưa xử lý, phải ghi chú rõ trạng thái.",
        ],
      },
    ],
  },
  {
    title: "VIII. Trách Nhiệm Thực Hiện",
    rules: [
      {
        title: "RULE 18 - Trách nhiệm theo dõi và đóng công việc",
        paragraphs: [
          "Người tiếp nhận công việc có trách nhiệm theo dõi công việc đó cho đến khi có kết quả cuối cùng hoặc đã bàn giao trách nhiệm rõ ràng cho người khác.",
          "Việc đã gửi yêu cầu, đã báo cáo hoặc đã chuyển lên cấp trên không đồng nghĩa với việc đã hoàn thành trách nhiệm.",
          "Nếu công việc đang chờ phản hồi, chờ phê duyệt hoặc chờ xử lý từ một cá nhân/bộ phận khác, người đang phụ trách công việc có trách nhiệm chủ động theo dõi và nhắc lại khi cần thiết.",
          "Đối với luồng công việc Seller -> Kế toán -> Cấp phê duyệt -> Kế toán -> Seller, trách nhiệm được xác định rõ theo từng bước.",
          "Seller có trách nhiệm tạo Request đầy đủ và đúng quy định; cung cấp/bổ sung thông tin khi Kế toán yêu cầu; theo dõi trạng thái Request trên hệ thống.",
          "Kế toán có trách nhiệm kiểm tra Request; xử lý trong thẩm quyền; chuyển cấp phê duyệt nếu vượt thẩm quyền; theo dõi trạng thái yêu cầu; chủ động nhắc lại nếu chưa có phản hồi; báo và thúc đẩy xử lý nếu có nguy cơ trễ; phản hồi lại cho Seller sau khi có kết quả phê duyệt.",
          "Cấp phê duyệt có trách nhiệm xem xét và đưa ra quyết định đối với các yêu cầu được chuyển lên.",
          "Các câu như “Em đã nhắn cấp trên rồi”, “Em đã gửi Request rồi”, “Em đang chờ duyệt”, “Cấp trên chưa phản hồi”, “Em tưởng người khác đang xử lý” không được xem là đã hoàn thành trách nhiệm nếu kết quả cuối cùng chưa có.",
          "Trong trường hợp công việc phụ thuộc vào phản hồi của cấp trên hoặc bộ phận khác: Gửi yêu cầu -> Theo dõi -> Nhắc lại -> Escalate nếu cần -> Nhận kết quả -> Phản hồi người yêu cầu -> Đóng công việc.",
          "Mỗi công việc cần xác định rõ một người chịu trách nhiệm chính (Owner). Owner có trách nhiệm đảm bảo công việc được theo dõi xuyên suốt cho đến khi hoàn thành, có kết quả, đã phản hồi người yêu cầu và đóng công việc.",
          "Nếu công việc được bàn giao cho người khác, việc bàn giao phải rõ ràng và người nhận phải xác nhận tiếp nhận. Không để tồn tại công việc ở trạng thái không biết hiện tại ai đang chịu trách nhiệm.",
          "Trách nhiệm được tính theo kết quả công việc, không chỉ theo hành động đã thực hiện. Một công việc chỉ được xem là hoàn thành khi đã có kết quả cuối cùng hoặc đã được bàn giao trách nhiệm rõ ràng cho người tiếp theo.",
        ],
      },
    ],
    paragraphs: [
      "Tất cả nhân sự Phòng Kế toán có trách nhiệm đọc và nắm rõ các quy định; thực hiện đúng phạm vi công việc và quyền hạn; chủ động kiểm tra dữ liệu thuộc phạm vi phụ trách; báo cáo khi phát hiện sai lệch hoặc bất thường; và chịu trách nhiệm đối với các thao tác, giao dịch do mình thực hiện.",
      "Trưởng và Phó bộ phận Kế toán có trách nhiệm theo dõi việc thực hiện các quy định trong bộ phận.",
    ],
  },
  {
    title: "IX. Nguyên Tắc Áp Dụng",
    paragraphs: [
      "Bộ quy định này được áp dụng theo tình hình vận hành hiện tại của Feline. Các Rule có thể được bổ sung, điều chỉnh hoặc cập nhật khi cơ cấu nhân sự, hệ thống, nguồn tiền hoặc phương thức vận hành của công ty thay đổi.",
      "Khi có phiên bản mới, Phòng Kế toán có trách nhiệm cập nhật và thực hiện theo quy định mới nhất.",
    ],
  },
];

export function OperatingRulesContent() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Quy định vận hành Phòng Kế toán</h1>
        <p className="text-sm text-muted-foreground">Công ty Feline</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mục lục</CardTitle>
          <CardDescription>Nội dung quy định được hiển thị cho toàn bộ vai trò trong hệ thống.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <a
              key={section.title}
              href={`#${section.title}`}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {section.title}
            </a>
          ))}
        </CardContent>
      </Card>

      {sections.map((section) => (
        <Card key={section.title} id={section.title} className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-7">
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.rules?.map((rule) => (
              <div key={rule.title} className="space-y-2 rounded-md border bg-muted/20 p-4">
                <h3 className="font-semibold">{rule.title}</h3>
                <div className="space-y-2 text-muted-foreground">
                  {rule.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
