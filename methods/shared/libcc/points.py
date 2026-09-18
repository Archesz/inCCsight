# coding: utf-8

def boundaries(imagem, conn = 8, dir = 'cw'):
    import numpy as np

    imagem = np.array(imagem, dtype='int32')

    bordasuperior = (imagem-imagem[np.r_[0,0:imagem.shape[0]-1],:])==1
    bordainferior = (imagem-imagem[np.r_[1:imagem.shape[0],imagem.shape[0]-1],:])==1
    bordadireita = (imagem-imagem[:,np.r_[1:imagem.shape[1],imagem.shape[1]-1]])==1
    bordaesquerda = (imagem-imagem[:,np.r_[0,0:imagem.shape[1]-1]])==1
    borda = bordasuperior+bordainferior+bordadireita+bordaesquerda

    y,x = np.nonzero(borda)
    boundary = np.zeros((x.shape[0],2))
    deslocamentoy = np.array([-1,-1,0,1,1,1,0,-1])
    deslocamentox = np.array([0,1,1,1,0,-1,-1,-1])
    vizinho = 1
    ybase = y[0]
    xbase = x[0]
    indice = 0
    boundary[indice] = [ybase,xbase]

    for i in np.arange(x.shape[0]-1):
        while (borda[ybase+deslocamentoy[vizinho],xbase+deslocamentox[vizinho]]==0):
            
            vizinho = (vizinho+1)%8
        indice = indice+1
        ybase = ybase+deslocamentoy[vizinho]
        xbase = xbase+deslocamentox[vizinho]
        boundary[indice] = [ybase,xbase]
        vizinho = (vizinho+5)%8
    return boundary

def points(resultado,npoints):
    import numpy as np
    from scipy import interpolate
    from scipy.ndimage.morphology import binary_closing

    #boundary = np.array([[2,1],[1,2],[1,3],[2,4],[2,5],[3,5],[3,4],[3,3],[2,2],[3,1]])

    ##### Determinação dos pontos extremos do corpo caloso #####

    boundary = boundaries(resultado)
    threshold = boundary[:,1].mean()
    frente = boundary[boundary[:,1]<threshold,:]
    fundo = boundary[boundary[:,1]>=threshold,:]
    yfrente = frente[:,0].max()
    xfrente = frente[frente[:,0]==yfrente,1].max()
    candfrente = np.nonzero(boundary[:,0]==yfrente)[0]

    try:
        indfrente = candfrente[boundary[boundary[:,0]==yfrente,1]==xfrente]
        yfundo = fundo[:,0].max()
        xfundo = np.floor(np.median(fundo[fundo[:,0]==yfundo,1]))
        candfundo = np.nonzero(boundary[:,0]==yfundo)[0]
        indfundo = candfundo[boundary[boundary[:,0]==yfundo,1]==xfundo]
        indfrente = indfrente[0]
        indfundo = indfundo[0]
    except:
        indfrente = candfrente[boundary[boundary[:,0]==yfrente,1]==xfrente]
        yfundo = fundo[:,0].max()
        xfundo = np.floor(np.median(fundo[fundo[:,0]==yfundo,1]))
        candfundo = np.nonzero(boundary[:,0]==yfundo)[0]
        indfundo = candfundo[boundary[boundary[:,0]==yfundo,1]==xfundo-1]
        indfrente = indfrente[0]
        indfundo = indfundo[0]        

    ##### Determinação das bordas superior e inferior #####
    if (indfrente > indfundo):
        bounddown = boundary[indfrente:indfundo-1:-1,:]
        boundup = boundary[np.r_[indfrente:boundary.shape[0],:indfundo+1],:]
    else:
        boundup = boundary[indfrente:indfundo+1,:]
        bounddown = boundary[np.r_[indfrente:-1:-1,boundary.shape[0]-1:indfundo-1:-1],:]

    min_pts = 4  # splprep requires m > k=3
    if len(boundup) < min_pts or len(bounddown) < min_pts:
        raise ValueError(
            f"Too few boundary points for spline (up={len(boundup)}, down={len(bounddown)})"
        )

    unew = np.linspace(0,1,npoints)
    tck,u = interpolate.splprep(boundup.transpose(),s=0)
    yupInter,xupInter = interpolate.splev(unew,tck)
    tck,u = interpolate.splprep(bounddown.transpose(),s=0)
    ydownInter,xdownInter = interpolate.splev(unew,tck)

    ymedio = (yupInter+ydownInter)/2
    xmedio = (xupInter+xdownInter)/2

    py = ymedio
    px = xmedio


    return px, py

def thickness(resultado, npoints):
    import numpy as np
    from scipy import interpolate

    boundary = boundaries(resultado)
    #boundary = np.array([[2,1],[1,2],[1,3],[2,4],[2,5],[3,5],[3,4],[3,3],[2,2],[3,1]])

    ##### Determinação dos pontos extremos do corpo caloso #####

    threshold = boundary[:,1].mean()
    frente = boundary[boundary[:,1]<threshold,:]
    fundo = boundary[boundary[:,1]>=threshold,:]
    yfrente = frente[:,0].max()
    xfrente = frente[frente[:,0]==yfrente,1].max()
    candfrente = np.nonzero(boundary[:,0]==yfrente)[0]

    try:
        indfrente = candfrente[boundary[boundary[:,0]==yfrente,1]==xfrente]
        yfundo = fundo[:,0].max()
        xfundo = np.floor(np.median(fundo[fundo[:,0]==yfundo,1]))
        candfundo = np.nonzero(boundary[:,0]==yfundo)[0]
        indfundo = candfundo[boundary[boundary[:,0]==yfundo,1]==xfundo]
        indfrente = indfrente[0]
        indfundo = indfundo[0]
    except:
        indfrente = candfrente[boundary[boundary[:,0]==yfrente,1]==xfrente]
        yfundo = fundo[:,0].max()
        xfundo = np.floor(np.median(fundo[fundo[:,0]==yfundo,1]))
        candfundo = np.nonzero(boundary[:,0]==yfundo)[0]
        indfundo = candfundo[boundary[boundary[:,0]==yfundo,1]==xfundo-1]
        indfrente = indfrente[0]
        indfundo = indfundo[0]    

    ##### Determinação das bordas superior e inferior #####
    if (indfrente > indfundo):
        bounddown = boundary[indfrente:indfundo-1:-1,:]
        boundup = boundary[np.r_[indfrente:boundary.shape[0],:indfundo+1],:]
    else:
        boundup = boundary[indfrente:indfundo+1,:]
        bounddown = boundary[np.r_[indfrente:-1:-1,boundary.shape[0]-1:indfundo-1:-1],:]

    min_pts = 4  # splprep requires m > k=3
    if len(boundup) < min_pts or len(bounddown) < min_pts:
        raise ValueError(
            f"Too few boundary points for spline (up={len(boundup)}, down={len(bounddown)})"
        )

    unew = np.linspace(0,1,npoints)
    tck,u = interpolate.splprep(boundup.transpose(),s=0)
    yupInter,xupInter = interpolate.splev(unew,tck)
    tck,u = interpolate.splprep(bounddown.transpose(),s=0)
    ydownInter,xdownInter = interpolate.splev(unew,tck)

    pts_up = np.vstack((xupInter, yupInter))
    pts_dw = np.vstack((xdownInter, ydownInter))

    thickness = np.linalg.norm((pts_up-pts_dw), axis=0)

    return thickness, pts_up, pts_dw


def CC_thickness(cc_msp, npoints=200):
    """Perpendicular thickness of the corpus callosum, sampled at `npoints`
    points along the body, as the distance between its upper and lower
    boundaries.

    Reference implementation (contour spline -> curvature endpoints ->
    upper/lower boundaries -> perpendicular distance). The scipy >=1.15
    `make_splprep` calls from the original were rewritten with the legacy
    `splprep`/`splev` API so it runs on the pinned scipy (1.11.x); the spline
    fit and its derivatives are mathematically equivalent.

    Returns (thickness_results, pts_up, pts_low).
    """
    import numpy as np
    import cv2 as cv
    from scipy import interpolate
    import math

    #--------------------
    # Initial CC contour
    #--------------------

    cc_msp = np.array(cc_msp, dtype='uint8')

    contours, _ = cv.findContours(cc_msp, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE)
    if len(contours) != 1:
        print("Warning! The number of contours found is not 1. The contour with the largest area will be selected.")
    contour = max(contours, key=cv.contourArea)
    boundary = contour[:, 0][:, ::-1]

    #---------------------
    # Smoothed CC contour
    #---------------------

    ext_points = boundary.shape[0] // 5
    boundary_ext = np.zeros((boundary.shape[0] + ext_points, boundary.shape[1]))
    boundary_ext[:boundary.shape[0]] = boundary
    boundary_ext[boundary.shape[0]:] = boundary[0:ext_points]

    npoints_boundary = boundary_ext.shape[0] * 5
    s = (npoints_boundary / 50)

    tck, _ = interpolate.splprep(boundary_ext.transpose(), s=s)
    unew = np.linspace(0, 1, npoints_boundary)
    yInter, xInter = interpolate.splev(unew, tck)

    # Identifying indexes to remove extra points
    min_dist = np.inf
    points_to_test = int(np.round((npoints_boundary * ext_points) / boundary_ext.shape[0]))
    n_points_neighbors = 5
    for i in range(points_to_test - (n_points_neighbors * 2)):
        idx_test_last = -(i + 1 + n_points_neighbors)
        for idx_test_first in range(n_points_neighbors, points_to_test - n_points_neighbors):
            sum_dist = 0
            for k in range(-n_points_neighbors, n_points_neighbors + 1):
                tmp_first = [xInter[idx_test_first + k], yInter[idx_test_first + k]]
                tmp_last = [xInter[idx_test_last + k], yInter[idx_test_last + k]]
                sum_dist += math.dist(tmp_first, tmp_last)
            if sum_dist < min_dist:
                min_dist = sum_dist
                idxs = (idx_test_first, idx_test_last)

    new_xInter = xInter[idxs[0]:idxs[1] + 1]
    new_yInter = yInter[idxs[0]:idxs[1] + 1]

    #--------------------------------
    # Curvature along the CC contour
    #--------------------------------

    dy, dx = interpolate.splev(unew, tck, der=1)    # First derivative
    d2y, d2x = interpolate.splev(unew, tck, der=2)  # Second derivative

    curvature = -(dx * d2y - dy * d2x) / (dx**2 + dy**2) ** (3 / 2)

    #-----------------------------------------------------
    # Limiting the points at which to check the curvature
    #-----------------------------------------------------

    anterior_indices = np.where(new_xInter < np.mean(new_xInter))
    anterior_indices_ext = np.append(anterior_indices[0], anterior_indices[0][0])
    ant_points = np.column_stack((new_xInter[anterior_indices_ext], new_yInter[anterior_indices_ext]))
    ant_points_dist = np.linalg.norm(np.diff(ant_points, axis=0), axis=1)
    max_dist_idx = np.argmax(ant_points_dist)
    idx_a = anterior_indices_ext[max_dist_idx]
    idx_b = anterior_indices_ext[max_dist_idx + 1]
    if new_yInter[idx_a] > new_yInter[idx_b]:
        max_x_low_anterior_index = idx_a
    else:
        max_x_low_anterior_index = idx_b

    y_sub = new_yInter[anterior_indices[0]]
    max_y_val = np.max(y_sub)
    max_y_anterior_index = anterior_indices[0][np.where(y_sub == max_y_val)[0][0]]

    #-------------------------------------
    # Finding idx of the anterior endpoint
    #-------------------------------------

    if max_y_anterior_index > max_x_low_anterior_index:
        print("Warning! Problem with the definition of the anterior endpoint!")

    max_curv_idx = np.argmax(curvature[idxs[0]:idxs[1]][max_y_anterior_index:max_x_low_anterior_index]) + (max_y_anterior_index)

    #--------------------------------------
    # Finding idx of the posterior endpoint
    #--------------------------------------

    posterior_indices = np.where(new_xInter > np.mean(new_xInter))
    post_end_idx = posterior_indices[0][np.argmax(new_yInter[posterior_indices])]

    #-----------------------------------------
    # Defining the upper and lower boundaries
    #-----------------------------------------

    if max_curv_idx < post_end_idx:
        lower_bound_x = new_xInter[max_curv_idx:post_end_idx + 1]
        lower_bound_y = new_yInter[max_curv_idx:post_end_idx + 1]
        upper_bound_x = np.concatenate((new_xInter[:max_curv_idx + 1][::-1], new_xInter[post_end_idx:-1][::-1]))
        upper_bound_y = np.concatenate((new_yInter[:max_curv_idx + 1][::-1], new_yInter[post_end_idx:-1][::-1]))
    else:
        lower_bound_x = np.concatenate((new_xInter[max_curv_idx:-1], new_xInter[:post_end_idx + 1]))
        lower_bound_y = np.concatenate((new_yInter[max_curv_idx:-1], new_yInter[:post_end_idx + 1]))
        upper_bound_x = new_xInter[post_end_idx:max_curv_idx + 1][::-1]
        upper_bound_y = new_yInter[post_end_idx:max_curv_idx + 1][::-1]

    unew = np.linspace(0, 1, npoints)
    tck, _ = interpolate.splprep(np.array([lower_bound_y, lower_bound_x]), s=0)
    yInter_low, xInter_low = interpolate.splev(unew, tck)
    tck, _ = interpolate.splprep(np.array([upper_bound_y, upper_bound_x]), s=0)
    yInter_up, xInter_up = interpolate.splev(unew, tck)

    #----------------------
    # Thickness calculation
    #----------------------

    pts_up = np.vstack((xInter_up, yInter_up))
    pts_low = np.vstack((xInter_low, yInter_low))

    thickness_results = np.linalg.norm((pts_up - pts_low), axis=0)

    return thickness_results, pts_up, pts_low
