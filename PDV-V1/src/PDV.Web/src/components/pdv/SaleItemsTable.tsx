import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ProductThumbnail } from './ProductThumbnail';
import { formatCurrency } from '../../utils/format';

export interface SaleItem {
  produtoId: string;
  nome: string;
  imagemUrl: string | null;
  quantidade: number;
  valorUnitario: number;
  desconto: number;
  estoqueAtual: number;
  controlaEstoque: boolean;
}

interface SaleItemsTableProps {
  items: SaleItem[];
  canEditDiscount: boolean;
  discountRequiresManagerApproval: boolean;
  onUpdateQuantity: (produtoId: string, quantidade: number) => void;
  onUpdateDiscount: (produtoId: string, desconto: number) => void;
  onRemove: (produtoId: string) => void;
}

export function SaleItemsTable({
  items,
  canEditDiscount,
  discountRequiresManagerApproval,
  onUpdateQuantity,
  onUpdateDiscount,
  onRemove
}: SaleItemsTableProps) {
  return (
    <Paper sx={{ overflow: 'hidden', borderRadius: 4 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Produto</TableCell>
            <TableCell width={130}>Qtd.</TableCell>
            <TableCell width={140}>Unitario</TableCell>
            <TableCell width={150}>Desconto</TableCell>
            <TableCell width={160}>Total</TableCell>
            <TableCell width={72}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const totalItem = item.quantidade * item.valorUnitario - item.desconto;
            return (
              <TableRow key={item.produtoId} hover>
                <TableCell>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <ProductThumbnail imageUrl={item.imagemUrl} name={item.nome} size={44} borderRadius={2} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700 }}>{item.nome}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.controlaEstoque ? `Estoque ${item.estoqueAtual.toFixed(3)}` : 'Estoque livre'}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    size="small"
                    value={item.quantidade}
                    onChange={(event) => onUpdateQuantity(item.produtoId, Number(event.target.value))}
                    inputProps={{ min: 1, step: '0.001' }}
                    fullWidth
                  />
                </TableCell>
                <TableCell>{formatCurrency(item.valorUnitario)}</TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    size="small"
                    value={item.desconto}
                    onChange={(event) => onUpdateDiscount(item.produtoId, Number(event.target.value))}
                    inputProps={{ min: 0, step: '0.01' }}
                    helperText={discountRequiresManagerApproval ? 'Sujeito a liberacao do gerente no fechamento.' : ' '}
                    fullWidth
                    disabled={!canEditDiscount}
                  />
                </TableCell>
                <TableCell>{formatCurrency(totalItem)}</TableCell>
                <TableCell>
                  <IconButton color="error" onClick={() => onRemove(item.produtoId)}>
                    <DeleteOutlineRoundedIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}
