const katex = require('katex');

const MOCK_CONTENT = `# Attention Is All You Need

## English
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.

Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.

### Background
The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU, ByteNet and ConvS2S, all of which use convolutional neural networks as basic building block, computing parallel representations for all input and output positions. In these models, the number of operations required to relate signals from two arbitrary input or output positions grows in the distance between positions, linearly for ConvS2S and logarithmically for ByteNet. This makes it more difficult to learn dependencies between distant positions. In the Transformer this is reduced to a constant number of operations.

### Model Architecture
Most competitive neural sequence transduction models have an encoder-decoder structure. Here, the encoder maps an input sequence of symbol representations $(x_1, ..., x_n)$ to a sequence of continuous representations \\\mathbf{z} = (z_1, ..., z_n)$. Given \\\mathbf{z}$, the decoder then generates an output sequence $(y_1, ..., y_m)$ of symbols one at a time. At each step the model is auto-regressive, consuming the previously generated symbols as additional input when generating the next.

The Transformer follows this overall architecture using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder, shown in the left and right halves of Figure 1, respectively.

### Encoder and Decoder Stacks
The encoder is composed of a stack of $N = 6$ identical layers. Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization. That is, the output of each sub-layer is \\\text{LayerNorm}(x + \\\text{Sublayer}(x))$, where \\\text{Sublayer}(x)$ is the function implemented by the sub-layer itself. To facilitate these residual connections, all sub-layers in the model, as well as the embedding layers, produce outputs of dimension $d_{\\\text{model}} = 512$.

---
## Tiếng Việt
Các mô hình chuyển đổi chuỗi phổ biến hiện nay dựa trên các mạng nơ-ron hồi quy hoặc mạng nơ-ron tích chập phức tạp bao gồm một bộ mã hóa và một bộ giải mã. Các mô hình hoạt động tốt nhất cũng kết nối bộ mã hóa và bộ giải mã thông qua một cơ chế chú ý. Chúng tôi đề xuất một kiến trúc mạng đơn giản mới, gọi là Transformer, chỉ dựa trên các cơ chế chú ý, loại bỏ hoàn toàn hồi quy và tích chập.

Các thử nghiệm trên hai tác vụ dịch máy cho thấy các mô hình này vượt trội về chất lượng trong khi có thể song song hóa nhiều hơn và đòi hỏi thời gian huấn luyện ít hơn đáng kể. Mô hình của chúng tôi đạt 28.4 BLEU trên tác vụ dịch tiếng Anh sang tiếng Đức của WMT 2014, cải thiện hơn kết quả tốt nhất hiện có, bao gồm cả các mô hình kết hợp, thêm hơn 2 BLEU.

### Bối cảnh
Mục tiêu giảm thiểu tính toán tuần tự cũng là nền tảng của Extended Neural GPU, ByteNet và ConvS2S, tất cả các mô hình này đều sử dụng mạng nơ-ron tích chập làm khối xây dựng cơ bản, tính toán các biểu diễn song song cho tất cả các vị trí đầu vào và đầu ra. Trong các mô hình này, số lượng hoạt động cần thiết để liên kết các tín hiệu từ hai vị trí đầu vào hoặc đầu ra bất kỳ tăng lên theo khoảng cách giữa các vị trí, tăng tuyến tính đối với ConvS2S và tăng theo logarit đối với ByteNet. Điều này gây khó khăn hơn cho việc học các phụ thuộc giữa các vị trí cách xa nhau. Trong Transformer, việc này được giảm xuống thành một số lượng hoạt động không đổi.

### Kiến trúc Mô hình
Hầu hết các mô hình chuyển đổi chuỗi nơ-ron cạnh tranh có cấu trúc bộ mã hóa - bộ giải mã. Ở đây, bộ mã hóa ánh xạ một chuỗi đầu vào gồm các biểu diễn ký hiệu $(x_1, ..., x_n)$ thành một chuỗi các biểu diễn liên tục \\\mathbf{z} = (z_1, ..., z_n)$. Với \\\mathbf{z}$, bộ giải mã sau đó tạo ra một chuỗi đầu ra $(y_1, ..., y_m)$ của các ký hiệu từng cái một. Tại mỗi bước, mô hình tự hồi quy, tiêu thụ các ký hiệu được tạo ra trước đó làm đầu vào bổ sung khi tạo ký hiệu tiếp theo.

Transformer tuân theo kiến trúc tổng thể này bằng cách sử dụng các lớp tự chú ý chồng lên nhau (stacked self-attention) và các lớp kết nối đầy đủ theo từng điểm (point-wise, fully connected layers) cho cả bộ mã hóa và bộ giải mã, tương ứng được hiển thị ở nửa trái và nửa phải của Hình 1.

### Ngăn xếp Bộ mã hóa và Bộ giải mã
Bộ mã hóa bao gồm một chồng gồm $N = 6$ lớp giống hệt nhau. Mỗi lớp có hai lớp con. Lớp đầu tiên là cơ chế tự chú ý đa đầu (multi-head self-attention), và lớp thứ hai là một mạng truyền thẳng kết nối đầy đủ theo từng vị trí đơn giản. Chúng tôi áp dụng một kết nối dư (residual connection) xung quanh mỗi lớp con trong số hai lớp con, tiếp theo là chuẩn hóa lớp (layer normalization). Nghĩa là, đầu ra của mỗi lớp con là \\\text{LayerNorm}(x + \\\text{Sublayer}(x))$, trong đó \\\text{Sublayer}(x)$ is the function implemented by the sub-layer itself. Để tạo điều kiện cho các kết nối dư này, tất cả các lớp con trong mô hình, cũng như các lớp nhúng, tạo ra các đầu ra có kích thước $d_{\\\text{model}} = 512$.
`;

function splitBilingual(raw) {
  const enRe = /^#{1,3}[^\S\r\n]*(english|en\b|english version)/im;
  const viRe = /^#{1,3}[^\S\r\n]*(tiếng việt|vietnamese|vi\b|bản dịch)/im;
  const enM = enRe.exec(raw);
  const viM = viRe.exec(raw);

  console.log('enM:', !!enM, enM ? enM.index : -1);
  console.log('viM:', !!viM, viM ? viM.index : -1);

  if (enM && viM) {
    const enStart = enM.index;
    const viStart = viM.index;
    if (enStart < viStart) {
      return { en: raw.slice(enStart + enM[0].length, viStart).trim(), vi: raw.slice(viStart + viM[0].length).trim(), hasEN: true };
    }
    return { en: raw.slice(enStart + enM[0].length).trim(), vi: raw.slice(viStart + viM[0].length, enStart).trim(), hasEN: true };
  }

  const parts = raw.split(/\n---\n/);
  if (parts.length >= 2) {
    return { en: parts[0].trim(), vi: parts.slice(1).join('\n---\n').trim(), hasEN: true };
  }

  return { en: '', vi: raw, hasEN: false };
}

function renderMarkdown(md) {
  if (!md) return '';

  const blockMaths = [];
  const inlineMaths = [];

  // Extract block math first
  let h = md.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, c) => {
    let renderedHtml = '';
    try {
      renderedHtml = katex.renderToString(c, { displayMode: true, throwOnError: false });
    } catch (e) {
      renderedHtml = `<code class="math-error">${c}</code>`;
    }
    blockMaths.push({ raw: c, html: renderedHtml });
    return `\x00BM${blockMaths.length - 1}\x00`;
  });

  // Extract inline math next
  h = h.replace(/\$([^\$\n]+?)\$/g, (_, c) => {
    let renderedHtml = '';
    try {
      renderedHtml = katex.renderToString(c, { displayMode: false, throwOnError: false });
    } catch (e) {
      renderedHtml = `<code class="math-error">${c}</code>`;
    }
    inlineMaths.push({ raw: c, html: renderedHtml });
    return `\x00IM${inlineMaths.length - 1}\x00`;
  });

  console.log('Extracted blockMaths:', blockMaths.length);
  console.log('Extracted inlineMaths:', inlineMaths.length, inlineMaths.map(x => x.raw));

  return h;
}

const parsed = splitBilingual(MOCK_CONTENT);
console.log('parsed.hasEN:', parsed.hasEN);
console.log('parsed.en.length:', parsed.en.length);
console.log('parsed.vi.length:', parsed.vi.length);

console.log('\n--- ENGLISH RENDER ---');
renderMarkdown(parsed.en);
