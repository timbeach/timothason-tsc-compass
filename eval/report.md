# TSC Compass evaluation report

Records: 292. Personas: 20 (labels for 0). E2 tune = even personas, test = odd personas.

E1 (session recovery) is a document-to-document proxy: each concurrent talk's stored vector and text are the query, and its organizer session-mates are the relevant set. Sessions are also shaped by logistics, so E1 compares configs and is not an absolute quality claim. E2 (personas) runs the real query path. The E2 label pool is the union of each config's top 10 plus 10 random documents, labeled blind.

| config | E1 MRR (95% CI) | E2 nDCG@10 tune | E2 nDCG@10 test |
|---|---|---|---|
| BM25 baseline | 0.153 [0.109, 0.200] | n/a | n/a |
| minilm / truncate / dense | 0.197 [0.147, 0.253] | n/a | n/a |
| minilm / truncate / hybrid a=0.5 | 0.178 [0.137, 0.227] | n/a | n/a |
| **minilm / truncate / hybrid a=0.7** | 0.204 [0.155, 0.261] | n/a | n/a |
| minilm / truncate / hybrid a=0.85 | 0.203 [0.152, 0.259] | n/a | n/a |
| minilm / truncate / rrf | 0.160 [0.120, 0.205] | n/a | n/a |
| minilm / chunk / dense | 0.187 [0.139, 0.238] | n/a | n/a |
| minilm / chunk / hybrid a=0.5 | 0.169 [0.127, 0.218] | n/a | n/a |
| minilm / chunk / hybrid a=0.7 | 0.191 [0.142, 0.245] | n/a | n/a |
| minilm / chunk / hybrid a=0.85 | 0.192 [0.142, 0.247] | n/a | n/a |
| minilm / chunk / rrf | 0.154 [0.116, 0.197] | n/a | n/a |
| bge-small / truncate / dense | 0.156 [0.113, 0.208] | n/a | n/a |
| bge-small / truncate / hybrid a=0.5 | 0.163 [0.120, 0.216] | n/a | n/a |
| bge-small / truncate / hybrid a=0.7 | 0.160 [0.117, 0.213] | n/a | n/a |
| bge-small / truncate / hybrid a=0.85 | 0.163 [0.119, 0.218] | n/a | n/a |
| bge-small / truncate / rrf | 0.144 [0.108, 0.187] | n/a | n/a |
| bge-small / chunk / dense | 0.164 [0.119, 0.219] | n/a | n/a |
| bge-small / chunk / hybrid a=0.5 | 0.164 [0.121, 0.213] | n/a | n/a |
| bge-small / chunk / hybrid a=0.7 | 0.168 [0.124, 0.220] | n/a | n/a |
| bge-small / chunk / hybrid a=0.85 | 0.168 [0.123, 0.219] | n/a | n/a |
| bge-small / chunk / rrf | 0.144 [0.107, 0.187] | n/a | n/a |
| gte-small / truncate / dense | 0.156 [0.111, 0.205] | n/a | n/a |
| gte-small / truncate / hybrid a=0.5 | 0.156 [0.114, 0.203] | n/a | n/a |
| gte-small / truncate / hybrid a=0.7 | 0.160 [0.114, 0.211] | n/a | n/a |
| gte-small / truncate / hybrid a=0.85 | 0.159 [0.113, 0.208] | n/a | n/a |
| gte-small / truncate / rrf | 0.147 [0.110, 0.186] | n/a | n/a |
| gte-small / chunk / dense | 0.179 [0.132, 0.234] | n/a | n/a |
| gte-small / chunk / hybrid a=0.5 | 0.164 [0.124, 0.210] | n/a | n/a |
| gte-small / chunk / hybrid a=0.7 | 0.175 [0.130, 0.226] | n/a | n/a |
| gte-small / chunk / hybrid a=0.85 | 0.178 [0.133, 0.230] | n/a | n/a |
| gte-small / chunk / rrf | 0.149 [0.113, 0.190] | n/a | n/a |

Selected: **minilm / truncate / hybrid a=0.7** (by E1 + E2 tune; E2 test is reported, never used for selection).
