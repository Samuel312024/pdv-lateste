import type { LoginResponse, UsuarioLogado } from '../types';

export interface FeatureRouteAccess {
  path: string;
  title: string;
  message: string;
  canAccess: (user: UsuarioLogado | null) => boolean;
}

function resolveUser(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  if (!sessionOrUser) {
    return null;
  }

  return 'usuario' in sessionOrUser ? sessionOrUser.usuario : sessionOrUser;
}

export function hasUserPermission(
  sessionOrUser: LoginResponse | UsuarioLogado | null | undefined,
  permission: string
) {
  const user = resolveUser(sessionOrUser);
  return user?.isMaster || user?.permissoes.includes(permission) || false;
}

export function hasAnyUserPermission(
  sessionOrUser: LoginResponse | UsuarioLogado | null | undefined,
  permissions: string[]
) {
  return permissions.some((permission) => hasUserPermission(sessionOrUser, permission));
}

export function hasAllUserPermissions(
  sessionOrUser: LoginResponse | UsuarioLogado | null | undefined,
  permissions: string[]
) {
  return permissions.every((permission) => hasUserPermission(sessionOrUser, permission));
}

export function isBuyerUser(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  const user = resolveUser(sessionOrUser);
  return user?.perfil === 'Comprador';
}

export function isCourierUser(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  const user = resolveUser(sessionOrUser);
  return user?.perfil === 'Entregador';
}

export function canAccessClientsFeature(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  return hasAnyUserPermission(sessionOrUser, ['VisualizarClientes', 'GerenciarClientes']);
}

export function canAccessCashierFeature(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  return hasAnyUserPermission(sessionOrUser, ['AbrirCaixa', 'FecharCaixa', 'SangriaCaixa', 'SuprimentoCaixa']);
}

export const featureRouteAccessList: readonly FeatureRouteAccess[] = [
  {
    path: '/dashboard',
    title: 'Dashboard bloqueado',
    message: 'Seu usuario nao possui a feature flag do dashboard. Peca ao administrador para liberar esse modulo.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarDashboard')
  },
  {
    path: '/usuarios',
    title: 'Gestao de usuarios bloqueada',
    message: 'Seu usuario nao pode administrar contas nem liberar funcionalidades. Peca ao administrador para liberar esse acesso.',
    canAccess: (user) => hasUserPermission(user, 'GerenciarUsuarios')
  },
  {
    path: '/produtos',
    title: 'Produtos bloqueado',
    message: 'Seu usuario nao possui a feature flag do cadastro de produtos.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarProduto')
  },
  {
    path: '/estoque',
    title: 'Estoque bloqueado',
    message: 'Seu usuario nao possui a feature flag do centro de estoque.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarProduto')
  },
  {
    path: '/catalogo-produtos',
    title: 'Catalogo digital bloqueado',
    message: 'Seu usuario nao possui a feature flag da vitrine digital de produtos.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarCatalogoProdutos')
  },
  {
    path: '/comprador/catalogo',
    title: 'Catalogo do comprador bloqueado',
    message: 'Seu usuario nao possui permissao para acessar o portal do comprador.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarCatalogoProdutos')
  },
  {
    path: '/pedidos',
    title: 'Pedidos bloqueado',
    message: 'Seu usuario nao possui a feature flag do painel operacional de pedidos.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarPedidos')
  },
  {
    path: '/meus-pedidos',
    title: 'Meus pedidos bloqueado',
    message: 'Seu usuario nao possui a feature flag para acompanhar os pedidos do comprador.',
    canAccess: (user) => hasAnyUserPermission(user, ['AcompanharPedidosCliente', 'RealizarPedidoCliente'])
  },
  {
    path: '/comprador/pedidos',
    title: 'Portal de pedidos bloqueado',
    message: 'Seu usuario nao possui permissao para acompanhar pedidos no portal do comprador.',
    canAccess: (user) => hasAnyUserPermission(user, ['AcompanharPedidosCliente', 'RealizarPedidoCliente'])
  },
  {
    path: '/entregador/entregas',
    title: 'Portal do entregador bloqueado',
    message: 'Seu usuario nao possui permissao para acessar o painel do entregador.',
    canAccess: (user) => hasUserPermission(user, 'AcessarPainelEntregador')
  },
  {
    path: '/consulta-preco',
    title: 'Consulta de preco bloqueada',
    message: 'Seu usuario nao possui a feature flag da consulta de preco.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarProduto')
  },
  {
    path: '/clientes',
    title: 'Clientes bloqueado',
    message: 'Seu usuario nao possui a feature flag da base de clientes e fornecedores.',
    canAccess: (user) => canAccessClientsFeature(user)
  },
  {
    path: '/transportadoras',
    title: 'Transportadoras bloqueado',
    message: 'Seu usuario nao possui acesso ao cadastro de transportadoras.',
    canAccess: (user) => canAccessClientsFeature(user)
  },
  {
    path: '/financeiro',
    title: 'Financeiro bloqueado',
    message: 'Seu usuario nao possui a feature flag do modulo financeiro.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarFinanceiro')
  },
  {
    path: '/empresa-fiscal',
    title: 'Empresa fiscal bloqueada',
    message: 'Seu usuario nao possui a feature flag da configuracao fiscal da empresa.',
    canAccess: (user) => hasUserPermission(user, 'GerenciarEmpresaFiscal')
  },
  {
    path: '/notas-fiscais',
    title: 'NF-e bloqueada',
    message: 'Seu usuario nao possui a feature flag do modulo de NF-e.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarNotasFiscais')
  },
  {
    path: '/monitor-operacional',
    title: 'Monitor operacional bloqueado',
    message: 'Seu usuario nao possui a feature flag do monitor operacional.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarMonitorOperacional')
  },
  {
    path: '/relatorios',
    title: 'Relatorios bloqueados',
    message: 'Seu usuario nao possui a feature flag dos relatorios gerenciais.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarRelatorios')
  },
  {
    path: '/hardware',
    title: 'Hardware bloqueado',
    message: 'Seu usuario nao possui a feature flag da area de hardware e automacao.',
    canAccess: (user) => hasUserPermission(user, 'VisualizarHardware')
  },
  {
    path: '/caixa',
    title: 'Caixa bloqueado',
    message: 'Seu usuario nao possui nenhuma feature flag de caixa liberada.',
    canAccess: (user) => canAccessCashierFeature(user)
  },
  {
    path: '/pdv',
    title: 'PDV bloqueado',
    message: 'Seu usuario precisa das feature flags de venda e visualizacao de produtos para operar o PDV.',
    canAccess: (user) => hasAllUserPermissions(user, ['RealizarVenda', 'VisualizarProduto'])
  }
];

export function canAccessAppPath(
  sessionOrUser: LoginResponse | UsuarioLogado | null | undefined,
  path: string | null | undefined
) {
  if (!path) {
    return false;
  }

  if (path === '/acesso-negado') {
    return true;
  }

  const route = featureRouteAccessList.find((item) => item.path === path);
  return route ? route.canAccess(resolveUser(sessionOrUser)) : false;
}

export function getDefaultAuthorizedPath(sessionOrUser: LoginResponse | UsuarioLogado | null | undefined) {
  const user = resolveUser(sessionOrUser);
  if (isBuyerUser(user) && hasUserPermission(user, 'VisualizarCatalogoProdutos')) {
    return '/comprador/catalogo';
  }

  if (isCourierUser(user) && hasUserPermission(user, 'AcessarPainelEntregador')) {
    return '/entregador/entregas';
  }

  const firstAllowed = featureRouteAccessList.find((item) => item.canAccess(user));
  return firstAllowed?.path ?? '/acesso-negado';
}
